import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Faker } from './faker.ts';
import { parseMinor } from './money.ts';
import type { Statement, StatementEntry } from './types.ts';

/**
 * Leaf elements whose text is kept: codes, dates, amounts, counts, currencies, country
 * codes and bank identifiers. The text of every other leaf element (names, addresses,
 * IBANs, account ids, references, payment text) is anonymised, so an element we have
 * never seen is replaced rather than leaked.
 */
const KEPT_ELEMENTS = new Set([
  'Amt', 'TtlAmt', 'TtlNetNtryAmt', 'Sum', 'InstdAmt', 'TxAmt', 'CntrValAmt',
  'CdtDbtInd', 'Cd', 'Sts', 'SubFmlyCd', 'Prtry', 'Issr',
  'Dt', 'DtTm', 'CreDtTm', 'FrDtTm', 'ToDtTm', 'QtnDt',
  'Ccy', 'SrcCcy', 'TrgtCcy', 'UnitCcy', 'XchgRate', 'Rate',
  'BIC', 'BICFI', 'Ctry',
  'NbOfNtries', 'NbOfTxs', 'ElctrncSeqNb', 'LglSeqNb', 'PgNb', 'LastPgInd',
  'RvslInd', 'ChrgInclInd', 'ChrgBr',
]);

/** A leaf element with text: `<ns:Name attrs>text</ns:Name>`. */
const LEAF = /<((?:[\w.-]+:)?([\w.-]+))(\s[^>]*)?>([^<]+)<\/\1>/g;

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeXml = (s: string): string =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITIES[name] ?? whole;
  });

const encodeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function anonymiseCamt053(input: Buffer, faker: Faker): Buffer {
  const xml = input.toString('utf8');
  const output = xml.replace(LEAF, (whole, qName: string, localName: string, attrs = '', text: string) => {
    if (KEPT_ELEMENTS.has(localName) || text.trim() === '') return whole;
    return `<${qName}${attrs}>${encodeXml(faker.text(decodeXml(text)))}</${qName}>`;
  });
  return Buffer.from(output, 'utf8');
}

type XmlNode = Record<string, unknown>;

const node = (value: unknown, path: string): XmlNode => {
  if (value === null || typeof value !== 'object') throw new Error(`CAMT.053: missing ${path}`);
  return value as XmlNode;
};

const text = (value: unknown, path: string): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in value) return String((value as XmlNode)['#text']);
  throw new Error(`CAMT.053: missing ${path}`);
};

const asArray = (value: unknown): unknown[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

const signed = (container: XmlNode, path: string): number => {
  const amount = parseMinor(text(container.Amt, `${path}/Amt`));
  return text(container.CdtDbtInd, `${path}/CdtDbtInd`) === 'DBIT' ? -amount : amount;
};

function readEntry(raw: unknown): StatementEntry {
  const entry = node(raw, 'Ntry');
  const sts = entry.Sts;
  const status = typeof sts === 'object' && sts !== null && 'Cd' in sts ? text((sts as XmlNode).Cd, 'Sts/Cd') : text(sts, 'Sts');
  return {
    bookingDate: text(node(entry.BookgDt, 'Ntry/BookgDt').Dt, 'Ntry/BookgDt/Dt'),
    amount: signed(entry, 'Ntry'),
    status,
  };
}

function balance(stmt: XmlNode, code: string): number | undefined {
  const bal = asArray(stmt.Bal)
    .map((b) => node(b, 'Bal'))
    .find((b) => text(node(node(b.Tp, 'Bal/Tp').CdOrPrtry, 'Bal/Tp/CdOrPrtry').Cd, 'Bal/Tp/CdOrPrtry/Cd') === code);
  return bal === undefined ? undefined : signed(bal, 'Bal');
}

export function readCamt053(input: Buffer): Statement {
  const xml = input.toString('utf8');
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`CAMT.053: invalid XML: ${validation.err.msg} (line ${validation.err.line})`);

  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, parseTagValue: false }).parse(xml) as XmlNode;
  const report = node(node(parsed.Document, 'Document').BkToCstmrStmt, 'BkToCstmrStmt');
  const statements = asArray(report.Stmt).map((s) => node(s, 'Stmt'));
  if (statements.length === 0) throw new Error('CAMT.053: no Stmt element');

  const first = statements[0]!;
  return {
    currency: text(node(first.Acct, 'Stmt/Acct').Ccy, 'Stmt/Acct/Ccy'),
    openingBalance: balance(first, 'OPBD'),
    closingBalance: balance(statements.at(-1)!, 'CLBD'),
    entries: statements.flatMap((s) => asArray(s.Ntry).map(readEntry)),
  };
}
