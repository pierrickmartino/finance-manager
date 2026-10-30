import { parseCsv, serializeCsv, type CsvRecord } from './csv.ts';
import type { Faker } from './faker.ts';
import { parseMinor } from './money.ts';
import type { Statement, StatementEntry } from './types.ts';

const DELIMITER = ';';
const BOM = '﻿';
const HEADER_MARKER = 'Date de comptabilisation';

interface UbsFile {
  readonly bom: string;
  readonly metadata: readonly CsvRecord[];
  readonly header: CsvRecord;
  readonly rows: readonly CsvRecord[];
}

function splitFile(input: Buffer): UbsFile {
  const text = input.toString('utf8');
  const bom = text.startsWith(BOM) ? BOM : '';
  const records = parseCsv(text.slice(bom.length), DELIMITER);
  const headerIndex = records.findIndex((r) => r.fields.some((f) => f.value === HEADER_MARKER));
  if (headerIndex < 0) throw new Error(`UBS CSV: no table header with "${HEADER_MARKER}"`);
  return {
    bom,
    metadata: records.slice(0, headerIndex),
    header: records[headerIndex]!,
    rows: records.slice(headerIndex + 1),
  };
}

function metadataValue(file: UbsFile, key: string): string | undefined {
  const record = file.metadata.find((r) => r.fields[0]?.value.trim() === `${key}:`);
  return record?.fields[1]?.value.trim();
}

function columnIndex(file: UbsFile, name: string): number {
  const index = file.header.fields.findIndex((f) => f.value === name);
  if (index < 0) throw new Error(`UBS CSV: missing column "${name}"`);
  return index;
}

const optionalMinor = (raw: string | undefined): number | undefined =>
  raw === undefined || raw.trim() === '' ? undefined : parseMinor(raw);

/** Metadata keys whose values are dates, balances, currency or counts: kept as is. */
const KEPT_METADATA = new Set([
  'Du:',
  'Au:',
  'Solde initial:',
  'Solde final:',
  "Date d'évaluation:",
  'Évaluation en date du:',
  'Monnaie:',
  'Nombre de transactions dans la période sélectionnée:',
]);

/** Table columns holding dates, times, currency and amounts: kept as is. Every other column is anonymised. */
const KEPT_COLUMNS = new Set([
  'Date de transaction',
  'Heure de transaction',
  HEADER_MARKER,
  'Date de valeur',
  'Monnaie',
  'Débit',
  'Crédit',
  'Sous-montant',
  'Solde',
]);

const replaceFields = (
  record: CsvRecord,
  shouldReplace: (index: number) => boolean,
  faker: Faker,
): CsvRecord => ({
  ...record,
  fields: record.fields.map((f, i) =>
    shouldReplace(i) && f.value !== '' ? { ...f, value: faker.text(f.value) } : f,
  ),
});

export function anonymiseUbsCsv(input: Buffer, faker: Faker): Buffer {
  const file = splitFile(input);
  const metadata = file.metadata.map((record) =>
    KEPT_METADATA.has(record.fields[0]?.value.trim() ?? '')
      ? record
      : replaceFields(record, (i) => i > 0, faker),
  );
  const kept = file.header.fields.map((f) => KEPT_COLUMNS.has(f.value));
  const rows = file.rows.map((row) => replaceFields(row, (i) => kept[i] !== true, faker));
  const text = serializeCsv([...metadata, file.header, ...rows], DELIMITER);
  return Buffer.from(file.bom + text, 'utf8');
}

export function readUbsCsv(input: Buffer): Statement {
  const file = splitFile(input);
  const col = (name: string): number => columnIndex(file, name);
  const [booking, debit, credit, balance] = [
    col(HEADER_MARKER),
    col('Débit'),
    col('Crédit'),
    col('Solde'),
  ];

  const entries: StatementEntry[] = [];
  for (const row of file.rows) {
    const cell = (i: number): string | undefined => row.fields[i]?.value;
    const debitMinor = optionalMinor(cell(debit));
    const creditMinor = optionalMinor(cell(credit));
    // Rows without Débit/Crédit are blank lines or sub-amounts of a bundled entry.
    if (debitMinor === undefined && creditMinor === undefined) continue;
    entries.push({
      bookingDate: cell(booking) ?? '',
      amount: (creditMinor ?? 0) - Math.abs(debitMinor ?? 0),
      runningBalance: optionalMinor(cell(balance)),
    });
  }

  const currency = metadataValue(file, 'Monnaie');
  if (!currency) throw new Error('UBS CSV: missing "Monnaie" in the metadata header');
  return {
    currency,
    openingBalance: optionalMinor(metadataValue(file, 'Solde initial')),
    closingBalance: optionalMinor(metadataValue(file, 'Solde final')),
    entries,
  };
}
