import { fractionDigits } from '@/lib/format';
import type { CategoryGroupType } from '../categories/model';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { BASE_CURRENCY, toChfMinor } from '../fx';
import {
  filterConditions,
  splitLineFilter,
  transactionQueryInput,
  type SplitLineFilter,
  type SqlCondition,
  type TransactionQuery,
} from '../transactions/query';
import { IS_SPLIT } from '../transactions/split-guard';
import { BOM, csvLine, decimalCell, textCell } from './csv';

/** The export's columns, in order. */
export const EXPORT_COLUMNS = [
  'Bank',
  'Account',
  'Account Currency',
  'Booking date',
  'Value date',
  'Amount',
  'CHF value',
  'Raw description',
  'Counterparty name',
  'Counterparty IBAN',
  'Payment reference',
  'Payee',
  'Category group',
  'Category group type',
  'Category',
  'Tags',
  'Notes',
  'Transfer Account',
  'Transfer Transaction id',
  'Source',
  'Transaction id',
] as const;

/** The Transaction list's filters (no paging): the export takes the same ones. */
export type TransactionFilter = Omit<TransactionQuery, 'page' | 'pageSize'>;

/**
 * Transactions read per query (with their Split lines): the export holds at most this many in
 * memory at once.
 */
export const EXPORT_BATCH_SIZE = 500;

/** Separates Tag names in the Tags cell. */
const TAG_SEPARATOR = '; ';

interface ExportRow {
  id: string;
  entryOrder: number;
  bankName: string;
  accountName: string;
  accountCurrency: string;
  bookingDate: string;
  valueDate: string | null;
  amountMinor: number;
  currency: string;
  /** CHF per unit at the booking date (or the most recent earlier rate); null for CHF or none. */
  rateToChf: string | null;
  rawDescription: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  paymentReference: string | null;
  payee: string | null;
  groupName: string | null;
  groupType: CategoryGroupType | null;
  category: string | null;
  tags: string | null;
  notes: string | null;
  transferAccount: string | null;
  transferTransactionId: string | null;
  importId: string | null;
  isSplit: boolean;
}

/**
 * `LEFT JOIN LATERAL (...) o`: the other side of a side's Transfer, a whole Transaction or a
 * Split line (ADR-0005). The side is given by its own Transaction id or Split line id, the other
 * one `NULL`. `o."transferAccount"` is the other side's Account (a line's is its Transaction's)
 * and `o."transferTransactionId"` its Transaction id.
 */
function otherSide(transferId: string, ownTransactionId: string, ownLineId: string): string {
  return `LEFT JOIN LATERAL (
    SELECT ob.name || ' · ' || oa.name AS "transferAccount", ot.id AS "transferTransactionId"
    FROM (SELECT x.id FROM "transaction" x
          WHERE x.transfer_id = ${transferId} AND x.id IS DISTINCT FROM ${ownTransactionId}
          UNION ALL
          SELECT ol.transaction_id FROM split_line ol
          WHERE ol.transfer_id = ${transferId} AND ol.id IS DISTINCT FROM ${ownLineId}) side
    JOIN "transaction" ot ON ot.id = side.id
    JOIN account oa ON oa.id = ot.account_id
    JOIN bank ob ON ob.id = oa.bank_id
    ORDER BY ot.id LIMIT 1
  ) o ON ${transferId} IS NOT NULL`;
}

// The FX rate is looked up exactly like the reporting SQL (#9 handoff): the rate of the booking
// date or the most recent earlier one; the conversion itself is `toChfMinor`, which matches
// PostgreSQL's `round(numeric)` to the cent.
const SELECT_EXPORT = `
  SELECT t.id, t.entry_order AS "entryOrder", b.name AS "bankName", a.name AS "accountName",
         a.currency AS "accountCurrency", t.booking_date AS "bookingDate",
         t.value_date AS "valueDate", t.amount_minor AS "amountMinor", t.currency,
         fx.rate AS "rateToChf", t.raw_description AS "rawDescription",
         t.counterparty_name AS "counterpartyName", t.counterparty_iban AS "counterpartyIban",
         t.payment_reference AS "paymentReference", p.name AS payee, g.name AS "groupName",
         g.type AS "groupType", c.name AS category,
         (SELECT string_agg(tg.name, '${TAG_SEPARATOR}' ORDER BY lower(tg.name))
          FROM transaction_tag xt JOIN tag tg ON tg.id = xt.tag_id
          WHERE xt.transaction_id = t.id) AS tags,
         t.notes, o."transferAccount", o."transferTransactionId", t.import_id AS "importId",
         ${IS_SPLIT} AS "isSplit"
  FROM "transaction" t
  JOIN account a ON a.id = t.account_id
  JOIN bank b ON b.id = a.bank_id
  LEFT JOIN payee p ON p.id = t.payee_id
  LEFT JOIN category c ON c.id = t.category_id
  LEFT JOIN category_group g ON g.id = c.group_id
  ${otherSide('t.transfer_id', 't.id', 'NULL')}
  LEFT JOIN LATERAL (
    SELECT trim_scale(r.rate_to_chf)::text AS rate FROM fx_rate r
    WHERE r.currency = t.currency AND r.date <= t.booking_date
    ORDER BY r.date DESC LIMIT 1
  ) fx ON t.currency <> '${BASE_CURRENCY}'`;

/** A Split line's own classification, which replaces its Transaction's on the line's row. */
interface ExportLine {
  transactionId: string;
  amountMinor: number;
  /** The line's own Payee; null when it reports under its Transaction's. */
  payee: string | null;
  /** Null, like its group, when the line is a Transfer side. */
  groupName: string | null;
  groupType: CategoryGroupType | null;
  category: string | null;
  tags: string | null;
  note: string | null;
  transferAccount: string | null;
  transferTransactionId: string | null;
}

const SELECT_LINES = `
  SELECT sl.transaction_id AS "transactionId", sl.amount_minor AS "amountMinor",
         lp.name AS payee, g.name AS "groupName", g.type AS "groupType", c.name AS category,
         (SELECT string_agg(tg.name, '${TAG_SEPARATOR}' ORDER BY lower(tg.name))
          FROM tag tg
          WHERE tg.id IN (SELECT lt.tag_id FROM split_line_tag lt WHERE lt.split_line_id = sl.id
                          UNION
                          SELECT xt.tag_id FROM transaction_tag xt
                          WHERE xt.transaction_id = sl.transaction_id)) AS tags,
         sl.note, o."transferAccount", o."transferTransactionId"
  FROM split_line sl
  JOIN "transaction" t ON t.id = sl.transaction_id
  LEFT JOIN payee lp ON lp.id = sl.payee_id
  LEFT JOIN category c ON c.id = sl.category_id
  LEFT JOIN category_group g ON g.id = c.group_id
  ${otherSide('sl.transfer_id', 'NULL', 'sl.id')}
  WHERE sl.transaction_id = ANY($1::uuid[])`;

/**
 * The batch's Split lines by Transaction id, in line order. Under a Category, group type or
 * Payee filter, only the lines that match it: a split Transaction exports the part that matched.
 */
async function loadLines(
  ctx: ServiceContext,
  ids: readonly string[],
  filter: SplitLineFilter,
): Promise<Map<string, ExportLine[]>> {
  const { conditions, params } = splitLineFilter(filter, 2);
  const result = await ctx.db.query<ExportLine>(
    `${SELECT_LINES} ${conditions.map((condition) => `AND ${condition}`).join(' ')}
     ORDER BY sl.transaction_id, sl.position`,
    [ids, ...params],
  );
  return Map.groupBy(result.rows, (line) => line.transactionId);
}

/**
 * The rows a Transaction exports as: itself when unsplit, otherwise one per Split line with
 * the Transaction's fields and the line's amount, Payee, Category, Tags, note and Transfer. A
 * line's Payee is its own, else its Transaction's (ADR-0006). A line
 * that is a Transfer side is written like a Transfer: no Category, the other side's Account and
 * Transaction id. A line's Tags are its own plus the Transaction's (as in reports); its Notes
 * are the line's note only.
 */
function expandRow(row: ExportRow, lines: readonly ExportLine[]): ExportRow[] {
  if (!row.isSplit) return [row];
  return lines.map((line) => ({
    ...row,
    amountMinor: line.amountMinor,
    payee: line.payee ?? row.payee,
    groupName: line.groupName,
    groupType: line.groupType,
    category: line.category,
    tags: line.tags,
    notes: line.note,
    transferAccount: line.transferAccount,
    transferTransactionId: line.transferTransactionId,
  }));
}

/** The CHF value cell: empty when no rate exists on or before the booking date. */
function chfCell(row: ExportRow): string {
  const digits = fractionDigits(BASE_CURRENCY);
  if (row.currency === BASE_CURRENCY) return decimalCell(row.amountMinor, digits);
  if (row.rateToChf === null) return '';
  return decimalCell(toChfMinor(row.amountMinor, row.currency, row.rateToChf), digits);
}

function rowCells(row: ExportRow): string[] {
  return [
    textCell(row.bankName),
    textCell(row.accountName),
    row.accountCurrency,
    row.bookingDate,
    row.valueDate ?? '',
    decimalCell(row.amountMinor, fractionDigits(row.currency)),
    chfCell(row),
    textCell(row.rawDescription),
    textCell(row.counterpartyName),
    textCell(row.counterpartyIban),
    textCell(row.paymentReference),
    textCell(row.payee),
    textCell(row.groupName),
    row.groupType ?? '',
    textCell(row.category),
    textCell(row.tags),
    textCell(row.notes),
    textCell(row.transferAccount),
    row.transferTransactionId ?? '',
    row.importId ?? 'manual',
    row.id,
  ];
}

/**
 * Every Transaction matching the Transaction list's filters as CSV (UTF-8 with BOM, RFC 4180),
 * oldest booking date first; a split Transaction as one row per Split line, each carrying the
 * Transaction id so the lines group back together. Filters are checked before anything is
 * returned (ValidationError); Transactions are then read in batches of EXPORT_BATCH_SIZE by
 * keyset, one chunk of text per batch, so a large export never sits in memory.
 */
export function exportTransactionsCsv(
  ctx: ServiceContext,
  filter: TransactionFilter = {},
): AsyncGenerator<string> {
  const input = parseInput(transactionQueryInput, filter);
  return generateCsv(ctx, filterConditions(input), input);
}

async function* generateCsv(
  ctx: ServiceContext,
  where: SqlCondition,
  lineFilter: SplitLineFilter,
): AsyncGenerator<string> {
  yield BOM + csvLine(EXPORT_COLUMNS);
  let after: { bookingDate: string; entryOrder: number } | null = null;
  for (;;) {
    const params = [...where.params];
    const conditions = where.sql ? [where.sql.replace(/^WHERE /, '')] : [];
    if (after) {
      params.push(after.bookingDate, after.entryOrder);
      conditions.push(
        `(t.booking_date, t.entry_order) > ($${params.length - 1}::date, $${params.length})`,
      );
    }
    params.push(EXPORT_BATCH_SIZE);
    const result = await ctx.db.query<ExportRow>(
      `${SELECT_EXPORT}
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY t.booking_date, t.entry_order
       LIMIT $${params.length}`,
      params,
    );
    const rows = result.rows;
    if (rows.length) {
      const lines = await loadLines(
        ctx,
        rows.map((row) => row.id),
        lineFilter,
      );
      yield rows
        .flatMap((row) => expandRow(row, lines.get(row.id) ?? []))
        .map((row) => csvLine(rowCells(row)))
        .join('');
    }
    if (rows.length < EXPORT_BATCH_SIZE) return;
    const last = rows[rows.length - 1]!;
    after = { bookingDate: last.bookingDate, entryOrder: last.entryOrder };
  }
}
