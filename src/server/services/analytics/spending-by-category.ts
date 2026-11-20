import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { runWidgetQuery } from '../reporting';
import type { AxisSelector } from '../reporting/cell-ref';
import type { ReportHeader } from '../reporting/headers';
import type { WidgetQuery } from '../reporting/query';
import { cellOf, sumOf, type Figure } from './figures';
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

/** One stacked series: a named Expense Category, or "Other". */
export interface SpendingSeries {
  /** The Category's id, or `OTHER_KEY`. */
  key: string;
  label: string;
  isOther: boolean;
  /** A segment per period of the window, oldest first. */
  cells: Figure[];
  /** The whole window, the current period included. */
  total: Figure;
}

export interface SpendingByCategory {
  periods: AnalyticsPeriod[];
  /** The named Categories, largest spending first, then "Other" when anything folds. */
  series: SpendingSeries[];
  /** No expense falls in the window. */
  isEmpty: boolean;
  /** Transactions left out for want of an FX rate. */
  unconvertedCount: number;
}

/** Largest spending first: the most negative total. Ties keep the Categories' own order. */
function rank(categories: readonly ReportHeader[], totalOf: (key: string) => number) {
  return categories
    .map((header, index) => ({ header, index, total: totalOf(header.key!) }))
    .sort((a, b) => a.total - b.total || a.index - b.index)
    .map(({ header }) => header);
}

interface SeriesSpec {
  key: string;
  label: string;
  isOther: boolean;
  /** The series' selector on the query's Category columns. */
  column: AxisSelector;
  valueAt: (periodKey: string) => number | null;
}

function series(
  query: WidgetQuery,
  window: readonly AnalyticsPeriod[],
  spec: SeriesSpec,
): SpendingSeries {
  const cells = window.map((period) => ({
    value: spec.valueAt(period.key),
    drill: { query, cell: { row: period.key, column: spec.column } },
  }));
  return {
    key: spec.key,
    label: spec.label,
    isOther: spec.isOther,
    cells,
    total: {
      value: sumOf(cells.map((cell) => cell.value)),
      drill: { query, cell: { column: spec.column } },
    },
  };
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
        series(report.query, window, {
          key: header.key!,
          label: header.label,
          isOther: false,
          column: header.key!,
          valueAt: (period) => cell(period, header.key),
        }),
      ),
      ...(folded.length === 0
        ? []
        : [
            series(report.query, window, {
              key: OTHER_KEY,
              label: OTHER_LABEL,
              isOther: true,
              column: { except: namedKeys },
              valueAt: (period) => sumOf(folded.map((header) => cell(period, header.key))),
            }),
          ]),
    ],
    isEmpty: report.total === null,
    unconvertedCount: report.unconvertedCount,
  };
}
