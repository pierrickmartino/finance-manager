import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { swissToday } from '../fx/dates';
import { ALL_HEADER, axisHeaders, type ReportHeader } from './headers';
import { intersect, periodSpan, periodsIn, resolveRange, type DateSpan } from './periods';
import {
  isTimeAxis,
  widgetQueryInput,
  type ReportAxis,
  type WidgetQuery,
  type WidgetQueryInput,
} from './query';
import { axisKey, baseCte, SqlParams, TAG_JOIN } from './sql';

/** The result of a Widget query: a rows × columns table of CHF values with totals. */
export interface ReportTable {
  /** The query with its defaults filled in. */
  query: WidgetQuery;
  /** The dates covered (inclusive). Empty (from after to) when a live range has none yet. */
  range: DateSpan;
  /** The current, incomplete period when the range includes it; its headers are flagged. */
  partialPeriod: DateSpan | null;
  rows: ReportHeader[];
  columns: ReportHeader[];
  /**
   * `cells[row][column]`: CHF minor units for `sum` and `average`, a number of Transactions for
   * `count`; null where no Transaction falls.
   */
  cells: (number | null)[][];
  rowTotals: (number | null)[];
  columnTotals: (number | null)[];
  total: number | null;
  /**
   * Transactions left out because their Currency has no FX rate on or before their booking
   * date (never counted as 0).
   */
  unconvertedCount: number;
}

type Grouping = 'cell' | 'row' | 'column' | 'all';

interface AggregateRow {
  grouping: Grouping | 'unconverted';
  rowKey: string | null;
  columnKey: string | null;
  sumMinor: number | null;
  count: number;
}

/** Currencies in use, for their minor-unit factors. */
export async function currenciesInUse(ctx: ServiceContext): Promise<string[]> {
  const result = await ctx.db.query<{ currency: string }>(
    'SELECT DISTINCT currency::text AS currency FROM account',
  );
  return result.rows.map((row) => row.currency);
}

/**
 * One aggregate SELECT over `report_base`, grouped by the given axes. `count` counts
 * Transactions: a split Transaction counts once in a group however many of its lines fall in.
 */
function groupedSelect(grouping: Grouping, rows: ReportAxis | null, columns: ReportAxis | null) {
  const rowKey = rows ? axisKey(rows) : 'NULL';
  const columnKey = columns ? axisKey(columns) : 'NULL';
  const groupBy = [rows && rowKey, columns && columnKey].filter(Boolean);
  const join = rows === 'tag' || columns === 'tag' ? TAG_JOIN : '';
  return `SELECT '${grouping}' AS grouping, ${rowKey} AS "rowKey", ${columnKey} AS "columnKey",
      sum(b.chf_minor)::bigint AS "sumMinor", count(DISTINCT b.id)::int AS count
    FROM report_base b ${join}
    WHERE b.chf_minor IS NOT NULL
    ${groupBy.length ? `GROUP BY ${groupBy.join(', ')}` : ''}`;
}

const cellKey = (row: string | null, column: string | null) => JSON.stringify([row, column]);

/**
 * Runs a Widget query: compiles it into one SQL statement that converts every amount to CHF at
 * its booking date, and returns the table with row, column and grand totals. A split
 * Transaction counts by its Split lines (ADR-0004). A Transaction or line with two Tags counts
 * under both Tags, but once in every total that isn't split by Tag.
 */
export async function runWidgetQuery(
  ctx: ServiceContext,
  input: WidgetQueryInput,
): Promise<ReportTable> {
  const query = parseInput(widgetQueryInput, input);
  const { range, partialPeriod } = resolveRange(query.dateRange, swissToday());
  const params = new SqlParams();
  const sql = `${baseCte(query, range, await currenciesInUse(ctx), params)}
    ${groupedSelect('cell', query.rows, query.columns)}
    UNION ALL ${groupedSelect('row', query.rows, null)}
    UNION ALL ${groupedSelect('column', null, query.columns)}
    UNION ALL ${groupedSelect('all', null, null)}
    UNION ALL SELECT 'unconverted', NULL, NULL, NULL, count(DISTINCT id)::int
      FROM report_base WHERE chf_minor IS NULL`;
  const aggregates =
    range.from <= range.to ? (await ctx.db.query<AggregateRow>(sql, params.values)).rows : [];

  const byGrouping = (grouping: Grouping) => aggregates.filter((row) => row.grouping === grouping);
  const cellRows = byGrouping('cell');
  const [rows, columns] = await Promise.all([
    axisHeaders(ctx.db, query.rows, new Set(cellRows.map((r) => r.rowKey)), range, partialPeriod),
    axisHeaders(
      ctx.db,
      query.columns,
      new Set(cellRows.map((r) => r.columnKey)),
      range,
      partialPeriod,
    ),
  ]);

  const value = (aggregate: AggregateRow | undefined, row: ReportHeader, column: ReportHeader) =>
    aggregate ? measureValue(query, range, aggregate, row, column) : null;
  const cellMap = new Map(cellRows.map((r) => [cellKey(r.rowKey, r.columnKey), r]));
  const rowMap = new Map(byGrouping('row').map((r) => [r.rowKey, r]));
  const columnMap = new Map(byGrouping('column').map((r) => [r.columnKey, r]));

  return {
    query,
    range,
    partialPeriod,
    rows,
    columns,
    cells: rows.map((row) =>
      columns.map((column) => value(cellMap.get(cellKey(row.key, column.key)), row, column)),
    ),
    rowTotals: rows.map((row) => value(rowMap.get(row.key), row, ALL_HEADER)),
    columnTotals: columns.map((column) => value(columnMap.get(column.key), ALL_HEADER, column)),
    total: value(byGrouping('all')[0], ALL_HEADER, ALL_HEADER),
    unconvertedCount: aggregates.find((row) => row.grouping === 'unconverted')?.count ?? 0,
  };
}

/** The dates one cell covers: the range, narrowed by the cell's time periods. */
export function cellSpan(
  query: WidgetQuery,
  range: DateSpan,
  row: ReportHeader,
  column: ReportHeader,
): DateSpan | null {
  let span: DateSpan | null = range;
  for (const [axis, header] of [
    [query.rows, row],
    [query.columns, column],
  ] as const) {
    if (span && isTimeAxis(axis) && header.key !== null) {
      span = intersect(span, periodSpan(header.key, axis));
    }
  }
  return span;
}

function measureValue(
  query: WidgetQuery,
  range: DateSpan,
  aggregate: AggregateRow,
  row: ReportHeader,
  column: ReportHeader,
): number | null {
  if (query.measure === 'count') return aggregate.count;
  if (aggregate.sumMinor === null) return null;
  if (query.measure === 'sum') return aggregate.sumMinor;
  const span = cellSpan(query, range, row, column);
  const periods = span ? periodsIn(span, query.averagePer).length : 0;
  return periods === 0 ? null : divideRounded(aggregate.sumMinor, periods);
}

/** Integer division rounded half away from zero, like the CHF conversion. */
function divideRounded(amount: number, by: number): number {
  const quotient = Math.round(Math.abs(amount) / by);
  return amount < 0 ? -quotient : quotient;
}
