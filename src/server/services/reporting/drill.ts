import { z } from 'zod';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { swissToday } from '../fx/dates';
import { listTransactionsByIds, type TransactionListItem } from '../transactions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../transactions/query';
import { cellPeriodCount, cellSpan, currenciesInUse, measureOf } from './engine';
import { ALL_HEADER, type ReportHeader } from './headers';
import { resolveRange, type DateSpan } from './periods';
import {
  widgetQueryInput,
  type Measure,
  type ReportAxis,
  type TimeAxis,
  type WidgetQuery,
  type WidgetQueryInput,
} from './query';
import { axisCondition, baseCte, SqlParams } from './sql';

/**
 * Which cell to drill into (spec 107), by the header keys of the report. An absent key means
 * the whole axis: `{ row }` is a row total, `{}` the grand total. `null` is the "none" bucket
 * (no Category, no Payee, no Tag), as in `ReportHeader.key`.
 */
export interface CellRef {
  row?: string | null;
  column?: string | null;
  page?: number;
  pageSize?: number;
}

const cellInput = z.object({
  row: z.string().max(100).nullable().optional(),
  column: z.string().max(100).nullable().optional(),
  page: z.number().int().min(1, 'Page must be 1 or more').default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE, `At most ${MAX_PAGE_SIZE} Transactions per page`)
    .default(DEFAULT_PAGE_SIZE),
});

/**
 * A Transaction under a report cell, with the CHF value the report counted: for a split
 * Transaction, the sum of its lines in the cell.
 */
export interface CellTransaction extends TransactionListItem {
  chfMinor: number;
  /**
   * For a split Transaction, how many of its Split lines count toward the cell (out of
   * `splitLines.length`); null for an unsplit one.
   */
  countedLineCount: number | null;
}

export interface CellTransactionPage {
  /** The measure of the number drilled into, and the period its `average` divides by. */
  measure: Measure;
  averagePer: TimeAxis;
  /** The number drilled into: it equals the report's value for this cell. */
  value: number | null;
  /** The `averagePer` periods in the cell's dates: what its `average` divides the sum by. */
  periodCount: number;
  /** The dates the cell covers: the range, narrowed by its time periods. */
  span: DateSpan | null;
  transactions: CellTransaction[];
  /** Transactions in the cell, across all pages. */
  total: number;
  /** CHF sum of the whole cell (null when empty): the cell's `sum` value. */
  sumChfMinor: number | null;
  /** Transactions that would fall in the cell but are left out: no FX rate yet. */
  unconvertedCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const UUID = z.uuid();
const ID_AXES: ReadonlySet<ReportAxis> = new Set([
  'categoryGroup',
  'category',
  'account',
  'payee',
  'tag',
]);

const headerOf = (key: string | null | undefined): ReportHeader =>
  key === undefined ? ALL_HEADER : { key, label: '', isPartial: false };

/**
 * The conditions (over `report_base b`) selecting the cell's rows, or null when a key is an
 * unknown id, which can't match anything (checking here keeps the uuid casts safe).
 */
function cellConditions(
  query: WidgetQuery,
  cell: { row?: string | null; column?: string | null },
  params: SqlParams,
): string[] | null {
  const conditions: string[] = [];
  for (const [axis, key] of [
    [query.rows, cell.row],
    [query.columns, cell.column],
  ] as const) {
    if (axis === null || key === undefined) continue;
    if (key !== null && ID_AXES.has(axis) && !UUID.safeParse(key).success) return null;
    conditions.push(axisCondition(axis, key, params));
  }
  return conditions;
}

interface CellRow {
  id: string;
  chfMinor: number;
  lineCount: number;
}

interface CellAggregate {
  total: number;
  sumMinor: number | null;
  unconverted: number;
  items: CellRow[] | null;
}

/**
 * Lists the Transactions behind one cell of a Widget query, newest first. They are read from
 * the same SQL as the report, so the cell's sum equals the sum of their CHF values, and come
 * with what its measure is worked out from: the sum, the count and the periods.
 */
export async function listCellTransactions(
  ctx: ServiceContext,
  queryInput: WidgetQueryInput,
  cellRef: CellRef,
): Promise<CellTransactionPage> {
  const query = parseInput(widgetQueryInput, queryInput);
  const cell = parseInput(cellInput, cellRef);
  const { page, pageSize } = cell;
  const { range } = resolveRange(query.dateRange, swissToday());
  const [row, column] = [headerOf(cell.row), headerOf(cell.column)];
  const measured = {
    measure: query.measure,
    averagePer: query.averagePer,
    periodCount: cellPeriodCount(query, range, row, column),
    span: cellSpan(query, range, row, column),
  };
  const empty: CellTransactionPage = {
    ...measured,
    value: null,
    transactions: [],
    total: 0,
    sumChfMinor: null,
    unconvertedCount: 0,
    page,
    pageSize,
    pageCount: 0,
  };
  if (range.from > range.to) return empty;

  const params = new SqlParams();
  const conditions = cellConditions(query, cell, params);
  if (conditions === null) return empty;
  const { total, sumMinor, unconverted, items } = await queryCell(
    ctx,
    query,
    range,
    conditions,
    params,
    cell,
  );
  const byId = new Map((items ?? []).map((item) => [item.id, item]));
  const transactions = await listTransactionsByIds(ctx, [...byId.keys()]);
  return {
    ...measured,
    value: measureOf(query.measure, { sumMinor, count: total, periods: measured.periodCount }),
    transactions: transactions.map((item) => {
      const counted = byId.get(item.id)!;
      return {
        ...item,
        chfMinor: counted.chfMinor,
        countedLineCount: item.splitLines.length > 0 ? counted.lineCount : null,
      };
    }),
    total,
    sumChfMinor: sumMinor,
    unconvertedCount: unconverted,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

/**
 * The whole cell's count and sum, the Transactions it leaves out for want of an FX rate, plus
 * one page of it. A split Transaction is listed once, with the CHF sum and the number of its
 * lines in the cell.
 */
async function queryCell(
  ctx: ServiceContext,
  query: WidgetQuery,
  range: DateSpan,
  conditions: string[],
  params: SqlParams,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<CellAggregate> {
  const cte = baseCte(query, range, await currenciesInUse(ctx), params);
  const limit = params.add(pageSize);
  const offset = params.add((page - 1) * pageSize);
  const where = (first: string) => [first, ...conditions].join(' AND ');
  const result = await ctx.db.query<CellAggregate>(
    `${cte}, cell AS (
       SELECT b.id, sum(b.chf_minor)::bigint AS chf_minor, count(b.line_id)::int AS line_count,
         t.booking_date, t.entry_order
       FROM report_base b JOIN "transaction" t ON t.id = b.id
       WHERE ${where('b.chf_minor IS NOT NULL')}
       GROUP BY b.id, t.booking_date, t.entry_order
     )
     SELECT (SELECT count(*)::int FROM cell) AS total,
       (SELECT sum(chf_minor)::bigint FROM cell) AS "sumMinor",
       (SELECT count(DISTINCT b.id)::int FROM report_base b
        WHERE ${where('b.chf_minor IS NULL')}) AS unconverted,
       (SELECT json_agg(json_build_object('id', p.id, 'chfMinor', p.chf_minor,
                                          'lineCount', p.line_count)
                        ORDER BY p.booking_date DESC, p.entry_order DESC)
        FROM (SELECT * FROM cell ORDER BY booking_date DESC, entry_order DESC
              LIMIT ${limit} OFFSET ${offset}) p) AS items`,
    params.values,
  );
  return result.rows[0]!;
}
