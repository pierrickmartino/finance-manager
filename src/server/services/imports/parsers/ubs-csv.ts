import { decodeUtf8 } from './text';
import {
  UnreadableFileError,
  type ImportParser,
  type ParsedEntry,
  type ParsedStatement,
} from './types';
import { normalizeIban, readCurrency, readDecimalMinor, readIsoDate, textOrNull } from './values';

/**
 * UBS CSV export (French headers): UTF-8 with BOM, `;` separators, a metadata block, an empty
 * line, then the table, newest row first. See test/fixtures/import/README.md for the layout.
 */

const SEPARATOR = ';';
const QUOTE = '"';

const META = {
  iban: 'IBAN',
  from: 'Du',
  to: 'Au',
  opening: 'Solde initial',
  closing: 'Solde final',
  currency: 'Monnaie',
} as const;

const COLUMNS = {
  bookingDate: 'Date de comptabilisation',
  valueDate: 'Date de valeur',
  currency: 'Monnaie',
  debit: 'Débit',
  credit: 'Crédit',
  balance: 'Solde',
  reference: 'No de transaction',
  description1: 'Description1',
  description2: 'Description2',
  description3: 'Description3',
  footnotes: 'Notes de bas de page',
} as const;

type Column = keyof typeof COLUMNS;

/** Splits one CSV line on `;`, honouring double quotes (`""` is a literal quote). */
function splitLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quoted) {
      if (char === QUOTE && line[i + 1] === QUOTE) {
        field += QUOTE;
        i++;
      } else if (char === QUOTE) {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === QUOTE) {
      quoted = true;
    } else if (char === SEPARATOR) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new UnreadableFileError('a quoted field is not closed');
  fields.push(field);
  return fields;
}

function readMetadata(lines: string[]): { meta: Map<string, string>; headerIndex: number } {
  const meta = new Map<string, string>();
  const headerIndex = lines.findIndex((line) => line.startsWith('Date de transaction;'));
  if (headerIndex < 0) throw new UnreadableFileError('the transaction table header is missing');
  for (const line of lines.slice(0, headerIndex)) {
    const [key = '', value = ''] = splitLine(line);
    if (key.endsWith(':')) meta.set(key.slice(0, -1).trim(), value.trim());
  }
  return { meta, headerIndex };
}

function requireMeta(meta: Map<string, string>, key: string): string {
  const value = meta.get(key);
  if (!value) throw new UnreadableFileError(`the header has no "${key}"`);
  return value;
}

/** `Description3`: `Raison du paiement: …; IBAN: CH.. ….; Frais: …` (card rows have neither). */
function readDescription3(text: string): { paymentReference: string | null; iban: string | null } {
  let paymentReference: string | null = null;
  let iban: string | null = null;
  for (const part of text.split(SEPARATOR)) {
    const [label = '', ...rest] = part.split(':');
    const value = rest.join(':').trim();
    if (label.trim() === 'Raison du paiement') paymentReference = textOrNull(value);
    if (label.trim() === 'IBAN') iban = value ? normalizeIban(value) : null;
  }
  return { paymentReference, iban };
}

function columnIndexes(header: string[]): Record<Column, number> {
  const entries = Object.entries(COLUMNS).map(([key, name]) => {
    const index = header.indexOf(name);
    if (index < 0) throw new UnreadableFileError(`the column "${name}" is missing`);
    return [key, index] as const;
  });
  return Object.fromEntries(entries) as Record<Column, number>;
}

function readRow(
  fields: string[],
  col: Record<Column, number>,
  currency: string,
): ParsedEntry | null {
  const get = (column: Column): string => (fields[col[column]] ?? '').trim();
  const reference = get('reference');
  const where = reference ? `Row ${reference}:` : 'A row:';
  // A row without a booking date is not booked yet: only booked Transactions are imported.
  if (!get('bookingDate')) return null;

  const rowCurrency = readCurrency(get('currency'), `${where} Currency`);
  if (rowCurrency !== currency) {
    throw new UnreadableFileError(`${where} Currency ${rowCurrency} differs from ${currency}`);
  }
  const debit = get('debit');
  const credit = get('credit');
  if ((debit === '') === (credit === '')) {
    throw new UnreadableFileError(`${where} exactly one of Débit and Crédit must be filled`);
  }
  const amountMinor =
    debit !== ''
      ? -Math.abs(readDecimalMinor(debit, currency, `${where} Débit`))
      : Math.abs(readDecimalMinor(credit, currency, `${where} Crédit`));
  const description3 = readDescription3(get('description3'));
  const rawDescription = (['description1', 'description2', 'description3', 'footnotes'] as const)
    .map(get)
    .filter((text) => text !== '')
    .join(' | ');

  return {
    bookingDate: readIsoDate(get('bookingDate'), `${where} Date de comptabilisation`),
    valueDate: get('valueDate') ? readIsoDate(get('valueDate'), `${where} Date de valeur`) : null,
    amountMinor,
    currency,
    bankReference: textOrNull(reference),
    rawDescription,
    counterpartyName: textOrNull(get('description1')),
    counterpartyIban: description3.iban,
    paymentReference: description3.paymentReference,
    bundledDetails: null,
    runningBalanceMinor: get('balance')
      ? readDecimalMinor(get('balance'), currency, `${where} Solde`)
      : null,
  };
}

export function parseUbsCsv(content: Uint8Array): ParsedStatement {
  const lines = decodeUtf8(content).split(/\r?\n/);
  const { meta, headerIndex } = readMetadata(lines);
  const currency = readCurrency(requireMeta(meta, META.currency), 'Monnaie');
  const col = columnIndexes(splitLine(lines[headerIndex]!));

  const newestFirst = lines
    .slice(headerIndex + 1)
    .filter((line) => line.trim() !== '')
    .map((line) => readRow(splitLine(line), col, currency))
    .filter((entry): entry is ParsedEntry => entry !== null);

  return {
    iban: normalizeIban(requireMeta(meta, META.iban)),
    currency,
    from: readIsoDate(requireMeta(meta, META.from), 'Du'),
    to: readIsoDate(requireMeta(meta, META.to), 'Au'),
    openingBalanceMinor: readDecimalMinor(
      requireMeta(meta, META.opening),
      currency,
      'Solde initial',
    ),
    closingBalanceMinor: readDecimalMinor(requireMeta(meta, META.closing), currency, 'Solde final'),
    entries: newestFirst.toReversed(),
  };
}

export const ubsCsvParser: ImportParser = { format: 'ubs_csv', parse: parseUbsCsv };
