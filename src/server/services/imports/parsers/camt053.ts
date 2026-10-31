import { decodeUtf8 } from './text';
import {
  UnreadableFileError,
  type BundledDetail,
  type ImportParser,
  type ParsedEntry,
  type ParsedStatement,
} from './types';
import { normalizeIban, readCurrency, readDecimalMinor, readIsoDate } from './values';
import { child, childrenNamed, parseXml, textAt, type XmlElement } from './xml';

/**
 * ISO 20022 CAMT.053 bank-to-customer statement (BCGE exports camt.053.001.04). One `Stmt` per
 * file. Each booked `Ntry` is one entry, even when it bundles several `TxDtls` (ADR-0003); the
 * details are kept for display. See test/fixtures/import/README.md for the layout.
 */

const DESCRIPTION_SEPARATOR = ' | ';
const BOOKED = 'BOOK';
const OPENING_BALANCE = ['OPBD', 'PRCD'] as const;
const CLOSING_BALANCE = ['CLBD'] as const;

type Direction = 'CRDT' | 'DBIT';

function readStatement(content: Uint8Array): XmlElement {
  const document = parseXml(decodeUtf8(content));
  const isCamt053 = Object.entries(document.attributes).some(
    ([name, value]) =>
      (name === 'xmlns' || name.startsWith('xmlns:')) && value.includes('camt.053'),
  );
  const container = child(document, 'BkToCstmrStmt');
  if (document.name !== 'Document' || !container || !isCamt053) {
    throw new UnreadableFileError('it is not a CAMT.053 statement');
  }
  const statements = childrenNamed(container, 'Stmt');
  if (statements.length !== 1) {
    throw new UnreadableFileError(`it holds ${statements.length} statements instead of one`);
  }
  return statements[0]!;
}

function readDirection(element: XmlElement | null, what: string): Direction {
  const indicator = textAt(element, 'CdtDbtInd');
  if (indicator !== 'CRDT' && indicator !== 'DBIT') {
    throw new UnreadableFileError(`${what} has no valid CdtDbtInd`);
  }
  return indicator;
}

/** An unsigned `Amt Ccy="…"` plus its `CdtDbtInd`, as signed minor units of the `Amt` Currency. */
function readSignedAmount(
  element: XmlElement,
  what: string,
  direction: Direction = readDirection(element, what),
): { amountMinor: number; currency: string } {
  const amount = child(element, 'Amt');
  if (!amount) throw new UnreadableFileError(`${what} has no amount`);
  const currency = readCurrency(amount.attributes.Ccy ?? '', `${what} Currency`);
  const minor = Math.abs(readDecimalMinor(amount.text, currency, `${what} amount`));
  return { amountMinor: direction === 'DBIT' ? -minor : minor, currency };
}

/** A `…Dt` element holding either `Dt` or `DtTm`. */
function readDate(element: XmlElement | null, what: string): string | null {
  const text = textAt(element, 'Dt') ?? textAt(element, 'DtTm')?.slice(0, 10) ?? null;
  return text === null ? null : readIsoDate(text, what);
}

function readBalance(stmt: XmlElement, codes: readonly string[]): number | null {
  for (const code of codes) {
    const balance = childrenNamed(stmt, 'Bal').find(
      (bal) =>
        (textAt(bal, 'Tp', 'CdOrPrtry', 'Cd') ?? textAt(bal, 'Tp', 'CdOrPrtry', 'Prtry')) === code,
    );
    if (balance) return readSignedAmount(balance, `The ${code} balance`).amountMinor;
  }
  return null;
}

/** `Sts` is plain text in camt.053.001.04 and `Sts/Cd` from .08 on. */
function readStatus(entry: XmlElement): string | null {
  return textAt(entry, 'Sts', 'Cd') ?? textAt(entry, 'Sts');
}

interface Counterparty {
  name: string | null;
  iban: string | null;
}

/** For a debit the counterparty is the creditor; for a credit it is the debtor. */
function readCounterparty(details: XmlElement, direction: Direction): Counterparty {
  const parties = child(details, 'RltdPties');
  const [party, account] = direction === 'DBIT' ? ['Cdtr', 'CdtrAcct'] : ['Dbtr', 'DbtrAcct'];
  const name = textAt(parties, party, 'Nm') ?? textAt(parties, party, 'Pty', 'Nm');
  const iban = textAt(parties, account, 'Id', 'IBAN');
  return { name, iban: iban ? normalizeIban(iban) : null };
}

/** Unstructured remittance text, or else the structured creditor reference (QR / SCOR). */
function readRemittance(details: XmlElement): string | null {
  const remittance = child(details, 'RmtInf');
  const unstructured = childrenNamed(remittance, 'Ustrd')
    .map((line) => line.text.trim())
    .filter((line) => line !== '');
  if (unstructured.length > 0) return unstructured.join(' ');
  return textAt(remittance, 'Strd', 'CdtrRefInf', 'Ref');
}

function readBundledDetail(details: XmlElement, entryDirection: Direction): BundledDetail {
  const direction = textAt(details, 'CdtDbtInd')
    ? readDirection(details, 'A detail')
    : entryDirection;
  const counterparty = readCounterparty(details, direction);
  return {
    amountMinor: child(details, 'Amt')
      ? readSignedAmount(details, 'A detail', direction).amountMinor
      : null,
    counterpartyName: counterparty.name,
    counterpartyIban: counterparty.iban,
    paymentReference: readRemittance(details),
  };
}

function readRawDescription(entry: XmlElement, details: readonly XmlElement[]): string {
  const parts = [
    textAt(entry, 'AddtlNtryInf'),
    ...details.map(readRemittance),
    ...details.map((detail) => textAt(detail, 'AddtlTxInf')),
  ].filter((part): part is string => part !== null);
  if (parts.length > 0) return parts.join(DESCRIPTION_SEPARATOR);
  // Never empty, so fallback Fingerprints still tell entries apart by their kind.
  const code = child(entry, 'BkTxCd', 'Domn');
  return (
    [textAt(code, 'Cd'), textAt(code, 'Fmly', 'Cd'), textAt(code, 'Fmly', 'SubFmlyCd')]
      .filter((part) => part !== null)
      .join('/') || 'CAMT entry'
  );
}

function readEntry(entry: XmlElement, index: number): ParsedEntry | null {
  const reference = textAt(entry, 'AcctSvcrRef');
  const where = reference ? `Entry ${reference}` : `Entry ${index + 1}`;
  // Only booked entries become Transactions (pending ones have no booking date yet).
  if (readStatus(entry) !== BOOKED) return null;
  const bookingDate = readDate(child(entry, 'BookgDt'), `${where} booking date`);
  if (!bookingDate) throw new UnreadableFileError(`${where} has no booking date`);

  const direction = readDirection(entry, where);
  const { amountMinor, currency } = readSignedAmount(entry, where, direction);
  const details = childrenNamed(entry, 'NtryDtls').flatMap((group) =>
    childrenNamed(group, 'TxDtls'),
  );
  const single = details.length === 1 ? details[0]! : null;
  const counterparty = single ? readCounterparty(single, direction) : null;
  // Card payments, ATM withdrawals and fees carry no related parties: BCGE names the merchant
  // (or the fee) only in AddtlNtryInf. A bundled entry's counterparties are its details.
  const counterpartyName =
    counterparty?.name ?? (details.length > 1 ? null : textAt(entry, 'AddtlNtryInf'));

  return {
    bookingDate,
    valueDate: readDate(child(entry, 'ValDt'), `${where} value date`),
    amountMinor,
    currency,
    bankReference: reference,
    rawDescription: readRawDescription(entry, details),
    counterpartyName,
    counterpartyIban: counterparty?.iban ?? null,
    paymentReference: single ? readRemittance(single) : null,
    bundledDetails:
      details.length > 1 ? details.map((detail) => readBundledDetail(detail, direction)) : null,
    runningBalanceMinor: null,
  };
}

export function parseCamt053(content: Uint8Array): ParsedStatement {
  const stmt = readStatement(content);
  const iban = textAt(stmt, 'Acct', 'Id', 'IBAN');
  const currency = readCurrency(
    textAt(stmt, 'Acct', 'Ccy') ?? child(stmt, 'Bal', 'Amt')?.attributes.Ccy ?? '',
    'The statement Currency',
  );
  const period = child(stmt, 'FrToDt');
  const fromText = textAt(period, 'FrDtTm');
  const toText = textAt(period, 'ToDtTm');
  const entries = childrenNamed(stmt, 'Ntry')
    .map(readEntry)
    .filter((entry): entry is ParsedEntry => entry !== null);

  return {
    iban: iban ? normalizeIban(iban) : null,
    currency,
    from: fromText ? readIsoDate(fromText.slice(0, 10), 'The statement start') : null,
    to: toText ? readIsoDate(toText.slice(0, 10), 'The statement end') : null,
    openingBalanceMinor: readBalance(stmt, OPENING_BALANCE),
    closingBalanceMinor: readBalance(stmt, CLOSING_BALANCE),
    // Oldest first; the sort is stable, so same-day entries keep the bank's order.
    entries: entries.toSorted((a, b) => a.bookingDate.localeCompare(b.bookingDate)),
  };
}

export const camt053Parser: ImportParser = { format: 'camt053', parse: parseCamt053 };
