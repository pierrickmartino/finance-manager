import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import { CATEGORY_GROUP_TYPES, listCategoryGroups, type CategoryGroup } from '../categories';
import type { ServiceContext } from '../context';
import { runWidgetQuery, type ReportTable } from '../reporting';
import type { WidgetQuery } from '../reporting/query';
import {
  analyticsCard,
  cellOf,
  periodRow,
  periodRowsSource,
  statusOf,
  sumOf,
  type AnalyticsCard,
  type PeriodRow,
} from './figures';
import type { AnalyticsPeriod } from './window';

/**
 * Analytics' Categories per period, drawn as the Dashboard's heatmap card: each Category group
 * of the three types (Income groups first, then Expense, then Capital) as a subtotal row, then
 * its Categories ("Group › Category"), per period of the window and in Total. Categories with
 * nothing booked in the window are hidden, and so is a group left with none. Signed CHF
 * amounts, as booked: a refund nets within its Category, Split lines count by their own
 * Category and Transfers are left out (the reporting engine's base rows).
 */

export const CATEGORIES_PER_PERIOD = 'Categories per period';

/** A group's subtotal then its Categories, or none when none has anything in the window. */
function groupRows(
  window: readonly AnalyticsPeriod[],
  report: ReportTable,
  group: CategoryGroup,
): PeriodRow[] {
  const cell = cellOf(report);
  const booked = new Set(report.rows.map((row) => row.key));
  const shown = group.categories.filter((category) => booked.has(category.id));
  if (shown.length === 0) return [];
  const categories = shown.map((category) =>
    periodRow(window, {
      key: category.id,
      label: `${group.name} › ${category.name}`,
      query: report.query,
      selector: category.id,
      valueAt: (period) => cell(category.id, period),
    }),
  );
  // No selector picks several Categories: the subtotal drills the query narrowed to the group.
  const groupQuery: WidgetQuery = {
    ...report.query,
    filters: { ...report.query.filters, categoryGroupIds: [group.id] },
  };
  const subtotal = periodRow(window, {
    key: `group:${group.id}`,
    label: group.name,
    query: groupQuery,
    valueAt: (period) => sumOf(shown.map((category) => cell(category.id, period))),
  });
  return [subtotal, ...categories];
}

const typeRank = (group: CategoryGroup) => CATEGORY_GROUP_TYPES.indexOf(group.type);

export async function categoriesPerPeriod(
  ctx: ServiceContext,
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
): Promise<AnalyticsCard> {
  const [report, groups] = await Promise.all([
    runWidgetQuery(ctx, {
      filters: { categoryGroupTypes: [...CATEGORY_GROUP_TYPES] },
      dateRange: windowRange(view),
      rows: 'category',
      columns: view,
    }),
    listCategoryGroups(ctx),
  ]);
  const ordered = [...groups].sort((a, b) => typeRank(a) - typeRank(b));
  const rows = ordered.flatMap((group) => groupRows(window, report, group));
  return analyticsCard({
    id: 'categories-per-period',
    name: CATEGORIES_PER_PERIOD,
    visualisation: 'table',
    rows: 'category',
    data: periodRowsSource(view, window, rows, report),
    status: statusOf(report),
  });
}
