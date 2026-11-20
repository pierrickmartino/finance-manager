import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import type { ReportHeader } from '../reporting/headers';
import {
  cellOf,
  periodRow,
  statusOf,
  sumOf,
  type FigureRow,
  type PeriodRowSpec,
  type SectionStatus,
} from './figures';
import type { AnalyticsPeriod } from './window';

/**
 * Analytics' Spending by Category stacked bar: one bar per period of the window, stacked by
 * Expense Category. The 8 largest Expense Categories by spending over the whole window are
 * shown by name; every other one folds into "Other". Signed CHF amounts, as booked: spending is
 * negative and a refund nets within its Category. Transfers are left out and Split lines count
 * by their own Category (the reporting engine's base rows).
 */

/** How many Expense Categories are stacked by name; the rest fold into "Other". */
export const NAMED_CATEGORIES = 8;
export const OTHER_KEY = 'other';
export const OTHER_LABEL = 'Other';

/**
 * One stacked series: a named Expense Category (keyed by its id), or "Other" (`OTHER_KEY`),
 * with a segment per period of the window, oldest first.
 */
export interface SpendingSeries extends FigureRow {
  isOther: boolean;
}

/** Empty when no expense falls in the window. */
export interface SpendingByCategory extends SectionStatus {
  periods: AnalyticsPeriod[];
  /** The named Categories, largest spending first, then "Other" when anything folds. */
  series: SpendingSeries[];
}

/** Largest spending first: the most negative total. Ties keep the Categories' own order. */
function rank(categories: readonly ReportHeader[], totalOf: (key: string) => number) {
  return categories
    .map((header, index) => ({ header, index, total: totalOf(header.key!) }))
    .sort((a, b) => a.total - b.total || a.index - b.index)
    .map(({ header }) => header);
}

/** A series: the Category columns it selects, against the periods on the query's rows. */
function series(
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
  isOther: boolean,
  spec: PeriodRowSpec<string>,
): SpendingSeries {
  return { ...periodRow(view, window, { ...spec, periodAxis: 'rows' }), isOther };
}

export async function spendingByCategory(
  ctx: ServiceContext,
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
): Promise<SpendingByCategory> {
  const report = await runWidgetQuery(ctx, {
    filters: { categoryGroupTypes: ['expense'] },
    dateRange: windowRange(view),
    rows: view,
    columns: 'category',
  });
  const cell = cellOf(report);
  // The type filter leaves no Unclassified bucket: every column is an Expense Category.
  const totals = new Map(report.columns.map((column, c) => [column.key, report.columnTotals[c]]));
  const ranked = rank(report.columns, (key) => totals.get(key) ?? 0);
  const named = ranked.slice(0, NAMED_CATEGORIES);
  const folded = ranked.slice(NAMED_CATEGORIES);
  const namedKeys = named.map((header) => header.key!);
  return {
    periods: [...window],
    series: [
      ...named.map((header) =>
        series(view, window, false, {
          key: header.key!,
          label: header.label,
          query: report.query,
          selector: header.key!,
          valueAt: (period) => cell(period, header.key),
        }),
      ),
      ...(folded.length === 0
        ? []
        : [
            series(view, window, true, {
              key: OTHER_KEY,
              label: OTHER_LABEL,
              query: report.query,
              selector: { except: namedKeys },
              valueAt: (period) => sumOf(folded.map((header) => cell(period, header.key))),
            }),
          ]),
    ],
    ...statusOf(report),
  };
}
