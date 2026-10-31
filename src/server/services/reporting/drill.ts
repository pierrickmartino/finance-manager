import { z } from 'zod';
import type { ServiceContext } from '../context';
import { parseInput } from '../errors';
import { swissToday } from '../fx/dates';
import { listTransactionsByIds, type TransactionListItem } from '../transactions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../transactions/query';
import { currenciesInUse } from './engine';
import { resolveRange } from './periods';
import { widgetQueryInput, type ReportAxis, type WidgetQueryInput } from './query';
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

/** A Transaction under a report cell, with the CHF value the report counted. */
export interface CellTransaction extends TransactionListItem {
  chfMinor: number;
}

export interface CellTransactionPage {
  transactions: CellTransaction[];
  /** Transactions in the cell, across all pages. */
  total: number;
  /** CHF sum of the whole cell (null when empty): the cell's `sum` value. */
  sumChfMinor: number | null;
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

/**
 * Lists the Transactions behind one cell of a Widget query, newest first. They are read from
 * the same SQL as the report, so the cell's sum equals the sum of their CHF values.
 */
export async function listCellTransactions(
  ctx: ServiceContext,
  queryInput: WidgetQueryInput,
  cellRef: CellRef,
): Promise<CellTransactionPage> {
  const query = parseInput(widgetQueryInput, queryInput);
  const cell = parseInput(cellInput, cellRef);
  const { page, pageSize } = cell;
  const empty = { transactions: [], total: 0, sumChfMinor: null, page, pageSize, pageCount: 0 };
  const { range } = resolveRange(query.dateRange, swissToday());
  if (range.from > range.to) return empty;

  const params = new SqlParams();
  const conditions = ['b.chf_minor IS NOT NULL'];
  for (const [axis, key] of [
    [query.rows, cell.row],
    [query.columns, cell.column],
  ] as const) {
    if (axis === null || key === undefined) continue;
    // An unknown id can't match anything; checking here keeps the uuid casts safe.
    if (key !== null && ID_AXES.has(axis) && !UUID.safeParse(key).success) return empty;
    conditions.push(axisCondition(axis, key, params));
  }
  const cte = baseCte(query, range, await currenciesInUse(ctx), params);
  const limit = params.add(pageSize);
  const offset = params.add((page - 1) * pageSize);
  // The whole cell's count and sum, plus one page of it.
  const result = await ctx.db.query<{
    total: number;
    sumMinor: number | null;
    items: { id: string; chfMinor: number }[] | null;
  }>(
    `${cte}, cell AS (
       SELECT b.id, b.chf_minor, t.booking_date, t.entry_order
       FROM report_base b JOIN "transaction" t ON t.id = b.id
       WHERE ${conditions.join(' AND ')}
     )
     SELECT (SELECT count(*)::int FROM cell) AS total,
       (SELECT sum(chf_minor)::bigint FROM cell) AS "sumMinor",
       (SELECT json_agg(json_build_object('id', p.id, 'chfMinor', p.chf_minor)
                        ORDER BY p.booking_date DESC, p.entry_order DESC)
        FROM (SELECT * FROM cell ORDER BY booking_date DESC, entry_order DESC
              LIMIT ${limit} OFFSET ${offset}) p) AS items`,
    params.values,
  );
  const { total, sumMinor, items } = result.rows[0]!;
  const chf = new Map((items ?? []).map((item) => [item.id, item.chfMinor]));
  const transactions = await listTransactionsByIds(ctx, [...chf.keys()]);
  return {
    transactions: transactions.map((item) => ({ ...item, chfMinor: chf.get(item.id)! })),
    total,
    sumChfMinor: sumMinor,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}
