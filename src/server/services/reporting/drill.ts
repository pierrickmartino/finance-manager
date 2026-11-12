import { z } from 'zod';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { swissToday } from '../fx/dates';
import { listTransactionsByIds, type TransactionListItem } from '../transactions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../transactions/query';
import { currenciesInUse, measureOf } from './engine';
import {
  intersect,
  periodCount,
  periodSpan,
  periodsIn,
  resolveRange,
  type DateSpan,
} from './periods';
import {
  isTimeAxis,
  widgetQueryInput,
  type Measure,
  type ReportAxis,
  type TimeAxis,
  type WidgetQuery,
  type WidgetQueryInput,
} from './query';
import { axisCondition, axisExceptCondition, axisKey, baseCte, SqlParams } from './sql';

import { ends, isExcept, keptBy, type AxisSelector, type CellRef } from './cell-ref';

export {
  ends,
  isExcept,
  keptBy,
  type AxisExcept,
  type AxisSelector,
  type CellRef,
} from './cell-ref';

/** More keys than a chart ever keeps out of "Other". */
const MAX_EXCEPT = 100;
const keyInput = z.string().max(100).nullable();
const selectorInput = z
  .union([keyInput, z.object({ except: z.array(keyInput).max(MAX_EXCEPT) })])
  .optional();

const cellInput = z.object({
  row: selectorInput,
  column: selectorInput,
  withPeriodSubtotals: z.boolean().default(false),
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

/** The CHF sum of one period of a cell (0 when no Transaction falls in it). */
export interface PeriodSubtotal {
  key: string;
  sumChfMinor: number;
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
  /**
   * When a change was asked for: the sum of each period of the rows in the cell, newest first,
   * over the whole cell (not only this page). Null otherwise.
   */
  subtotals: PeriodSubtotal[] | null;
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

type CellAxes = Pick<CellRef, 'row' | 'column'>;

const axesOf = (query: WidgetQuery, cell: CellAxes) =>
  [
    [query.rows, cell.row],
    [query.columns, cell.column],
  ] as const;

/**
 * The conditions (over `report_base b`) selecting the cell's rows, or null when a key is an
 * unknown id, which can't match anything (checking here keeps the uuid casts safe).
 */
function cellConditions(query: WidgetQuery, cell: CellAxes, params: SqlParams): string[] | null {
  const conditions: string[] = [];
  for (const [axis, key] of axesOf(query, cell)) {
    if (axis === null || key === undefined) continue;
    if (isExcept(key)) {
      conditions.push(axisExceptCondition(axis, key.except, params));
      continue;
    }
    if (key !== null && ID_AXES.has(axis) && !UUID.safeParse(key).success) return null;
    conditions.push(axisCondition(axis, key, params));
  }
  return conditions;
}

/** The periods of a time axis in `span` that the selector keeps (all when absent), oldest first. */
function keptPeriods(axis: TimeAxis, selector: AxisSelector | undefined, span: DateSpan): string[] {
  return keptBy(periodsIn(span, axis), (key) => key, selector);
}

/**
 * The dates the cell covers: the range, narrowed by its time periods. Every period but some
 * covers from the first period it keeps to the last.
 */
function drillSpan(query: WidgetQuery, range: DateSpan, cell: CellAxes): DateSpan | null {
  let span: DateSpan | null = range.from > range.to ? null : range;
  for (const [axis, selector] of axesOf(query, cell)) {
    if (!span || !isTimeAxis(axis) || selector === undefined || selector === null) continue;
    const kept = ends(keptPeriods(axis, selector, range));
    span = kept
      ? intersect(span, { from: periodSpan(kept[0], axis).from, to: periodSpan(kept[1], axis).to })
      : null;
  }
  return span;
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
  subtotals: PeriodSubtotal[] | null;
}

type ParsedCell = z.infer<typeof cellInput>;

/** What a cell is read for: its query, its range and dates, and the page asked for. */
interface CellRead {
  query: WidgetQuery;
  range: DateSpan;
  span: DateSpan | null;
  cell: ParsedCell;
  /** The time axis to sum the cell per period of, or null for no subtotals. */
  subtotalAxis: TimeAxis | null;
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
  const { range } = resolveRange(query.dateRange, swissToday());
  const span = drillSpan(query, range, cell);
  const subtotalAxis = cell.withPeriodSubtotals && isTimeAxis(query.rows) ? query.rows : null;
  const read: CellRead = { query, range, span, cell, subtotalAxis };
  if (span === null) return cellPage(read, null, []);

  const params = new SqlParams();
  const conditions = cellConditions(query, cell, params);
  if (conditions === null) return cellPage(read, null, []);
  const aggregate = await queryCell(ctx, read, { conditions, params });
  const transactions = await listTransactionsByIds(
    ctx,
    (aggregate.items ?? []).map((item) => item.id),
  );
  return cellPage(read, aggregate, transactions);
}

/**
 * The page of a cell read: its number and what it's worked out from, and the listed
 * Transactions with what each counts toward it. With no aggregate, the cell is empty.
 */
function cellPage(
  { query, span, cell, subtotalAxis }: CellRead,
  aggregate: CellAggregate | null,
  listed: TransactionListItem[],
): CellTransactionPage {
  const { page, pageSize } = cell;
  const total = aggregate?.total ?? 0;
  const sumMinor = aggregate?.sumMinor ?? null;
  const periods = periodCount(span, query.averagePer);
  const keys = subtotalAxis && span ? keptPeriods(subtotalAxis, cell.row, span) : [];
  const subtotals = subtotalAxis ? periodSubtotals(keys, aggregate) : null;
  return {
    measure: query.measure,
    averagePer: query.averagePer,
    periodCount: periods,
    span,
    value: aggregate ? measureOf(query.measure, { sumMinor, count: total, periods }) : null,
    transactions: countedTransactions(listed, aggregate?.items ?? []),
    total,
    sumChfMinor: sumMinor,
    unconvertedCount: aggregate?.unconverted ?? 0,
    subtotals,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

/** Each kept period's sum, newest first (0 for a period no Transaction falls in). */
function periodSubtotals(keys: string[], aggregate: CellAggregate | null): PeriodSubtotal[] {
  const byKey = new Map((aggregate?.subtotals ?? []).map((item) => [item.key, item.sumChfMinor]));
  return keys.toReversed().map((key) => ({ key, sumChfMinor: byKey.get(key) ?? 0 }));
}

/** The listed Transactions, each with the CHF value and the Split lines it counts in the cell. */
function countedTransactions(listed: TransactionListItem[], rows: CellRow[]): CellTransaction[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return listed.map((item) => {
    const counted = byId.get(item.id)!;
    return {
      ...item,
      chfMinor: counted.chfMinor,
      countedLineCount: item.splitLines.length > 0 ? counted.lineCount : null,
    };
  });
}

/** The cell's conditions, with the parameters they bind. */
interface CellSql {
  conditions: string[];
  params: SqlParams;
}

/**
 * The whole cell's count and sum, the Transactions it leaves out for want of an FX rate, plus
 * one page of it. A split Transaction is listed once, with the CHF sum and the number of its
 * lines in the cell.
 */
async function queryCell(
  ctx: ServiceContext,
  { query, range, cell, subtotalAxis }: CellRead,
  { conditions, params }: CellSql,
): Promise<CellAggregate> {
  const cte = baseCte(query, range, await currenciesInUse(ctx), params);
  const limit = params.add(cell.pageSize);
  const offset = params.add((cell.page - 1) * cell.pageSize);
  const where = (first: string) => [first, ...conditions].join(' AND ');
  const subtotals = subtotalAxis
    ? `(SELECT json_agg(json_build_object('key', s.key, 'sumChfMinor', s.sum_minor))
        FROM (SELECT ${axisKey(subtotalAxis)} AS key, sum(b.chf_minor)::bigint AS sum_minor
              FROM report_base b WHERE ${where('b.chf_minor IS NOT NULL')} GROUP BY 1) s)`
    : 'NULL';
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
              LIMIT ${limit} OFFSET ${offset}) p) AS items,
       ${subtotals} AS subtotals`,
    params.values,
  );
  return result.rows[0]!;
}
