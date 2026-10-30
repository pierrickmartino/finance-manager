import { decodeWindows1252 } from './cp1252';
import {
  UnreadableFileError,
  type ImportParser,
  type ParsedEntry,
  type ParsedStatement,
} from './types';
import { readCurrency, readDecimalMinor, readIsoDate, textOrNull } from './values';

/**
 * OFX 1.02 SGML, as Crédit Agricole exports it: a colon-style header, then SGML whose leaf tags
 * are usually left unclosed (`<TRNAMT>-38.90`). Closed leaf tags are accepted too. The text is
 * Windows-1252 unless the header says UTF-8. See test/fixtures/import/README.md.
 *
 * OFX has no IBAN and no opening balance: the statement carries the bank's account identifiers
 * instead, and only the closing balance (`LEDGERBAL`). The pipeline derives the opening balance.
 */

/** An SGML element: a leaf has a value, an aggregate has children. */
interface OfxNode {
  name: string;
  value: string | null;
  children: OfxNode[];
}

const TAG = /<(\/?)([A-Za-z0-9._]+)>([^<]*)/g;

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&nbsp;': ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(?:lt|gt|amp|nbsp);/g, (entity) => ENTITIES[entity]!);
}

function decode(content: Uint8Array): string {
  const headerEnd = content.indexOf(0x3c); // the first `<`
  const header = new TextDecoder('latin1').decode(content.subarray(0, Math.max(headerEnd, 0)));
  if (/^\s*(?:CHARSET|ENCODING)\s*:\s*UTF-?8\s*$/im.test(header)) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
      throw new UnreadableFileError('its header says UTF-8, but it is not UTF-8 text');
    }
  }
  return decodeWindows1252(content);
}

/**
 * Builds the element tree. An open tag followed by text is a leaf (its close tag, if present,
 * is skipped); an open tag followed directly by another tag is an aggregate. A close tag pops
 * back to its matching aggregate, so stray or missing close tags don't derail the parse.
 */
function parseSgml(body: string): OfxNode {
  const root: OfxNode = { name: '#root', value: null, children: [] };
  const stack: OfxNode[] = [root];
  let lastLeaf: OfxNode | null = null;
  for (const [, slash, rawName, rawText = ''] of body.matchAll(TAG)) {
    const name = rawName!.toUpperCase();
    const parent = stack.at(-1)!;
    if (slash) {
      if (lastLeaf?.name === name) {
        lastLeaf = null;
        continue;
      }
      const index = stack.findLastIndex((node) => node.name === name);
      if (index > 0) stack.length = index;
      lastLeaf = null;
      continue;
    }
    const text = rawText.trim();
    const node: OfxNode = { name, value: null, children: [] };
    parent.children.push(node);
    if (text === '') {
      stack.push(node);
      lastLeaf = null;
    } else {
      node.value = decodeEntities(text);
      lastLeaf = node;
    }
  }
  return root;
}

function child(node: OfxNode, name: string): OfxNode | undefined {
  return node.children.find((c) => c.name === name);
}

/** The first element with this name anywhere below `node`, depth first. */
function find(node: OfxNode, name: string): OfxNode | undefined {
  for (const c of node.children) {
    if (c.name === name) return c;
    const found = find(c, name);
    if (found) return found;
  }
  return undefined;
}

/** A leaf's text; an empty closed element (`<MEMO></MEMO>`) reads as blank. */
function leaf(node: OfxNode | undefined, name: string): string | undefined {
  const found = node && child(node, name);
  if (!found) return undefined;
  return found.value ?? '';
}

function required(node: OfxNode, name: string, what: string): string {
  const value = textOrNull(leaf(node, name));
  if (value === null) throw new UnreadableFileError(`${what} has no ${name}`);
  return value;
}

/** `YYYYMMDD`, optionally followed by a time and a time zone (`20251003120000[+1:CET]`). */
function readOfxDate(text: string, what: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(text.trim());
  if (!match) throw new UnreadableFileError(`${what} "${text}" is not a date`);
  return readIsoDate(`${match[1]}-${match[2]}-${match[3]}`, what);
}

function readAmount(text: string, currency: string, what: string): number {
  const separator = text.includes(',') && !text.includes('.') ? ',' : '.';
  return readDecimalMinor(text, currency, what, separator);
}

function readEntry(node: OfxNode, currency: string): ParsedEntry {
  const fitid = textOrNull(leaf(node, 'FITID'));
  const what = fitid ? `Transaction ${fitid}` : 'A transaction';
  const name = textOrNull(leaf(node, 'NAME'));
  const memo = textOrNull(leaf(node, 'MEMO'));
  const rawDescription = memo ?? name;
  if (rawDescription === null) throw new UnreadableFileError(`${what} has no NAME or MEMO`);
  return {
    bookingDate: readOfxDate(required(node, 'DTPOSTED', what), `${what}: DTPOSTED`),
    valueDate: null,
    amountMinor: readAmount(required(node, 'TRNAMT', what), currency, `${what}: TRNAMT`),
    currency,
    bankReference: fitid,
    rawDescription,
    counterpartyName: name,
    counterpartyIban: null,
    paymentReference: null,
    bundledDetails: null,
    runningBalanceMinor: null,
  };
}

function parse(content: Uint8Array): ParsedStatement {
  const text = decode(content);
  const start = text.indexOf('<');
  if (start < 0 || !/OFXHEADER|<OFX>/i.test(text)) {
    throw new UnreadableFileError('it is not an OFX file');
  }
  const root = parseSgml(text.slice(start));
  const statement = find(root, 'STMTRS');
  if (!statement) throw new UnreadableFileError('it has no bank statement (STMTRS)');

  const currency = readCurrency(required(statement, 'CURDEF', 'The statement'), 'CURDEF');
  const account = child(statement, 'BANKACCTFROM');
  const list = child(statement, 'BANKTRANLIST');
  const ledger = child(statement, 'LEDGERBAL');
  const dtStart = textOrNull(leaf(list, 'DTSTART'));
  const dtEnd = textOrNull(leaf(list, 'DTEND'));
  const balance = ledger && textOrNull(leaf(ledger, 'BALAMT'));

  const entries = (list?.children ?? [])
    .filter((node) => node.name === 'STMTTRN')
    .map((node) => readEntry(node, currency))
    // Oldest first; the sort is stable, so same-day entries keep the bank's order.
    .sort((a, b) => (a.bookingDate < b.bookingDate ? -1 : a.bookingDate > b.bookingDate ? 1 : 0));

  return {
    iban: null,
    bankAccount: account
      ? {
          bankId: textOrNull(leaf(account, 'BANKID')),
          branchId: textOrNull(leaf(account, 'BRANCHID')),
          accountId: textOrNull(leaf(account, 'ACCTID')),
        }
      : null,
    currency,
    from: dtStart ? readOfxDate(dtStart, 'DTSTART') : null,
    to: dtEnd ? readOfxDate(dtEnd, 'DTEND') : null,
    openingBalanceMinor: null,
    closingBalanceMinor: balance ? readAmount(balance, currency, 'LEDGERBAL: BALAMT') : null,
    entries,
  };
}

export const ofxParser: ImportParser = { format: 'ofx', parse };
