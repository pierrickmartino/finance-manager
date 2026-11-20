import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import {
  CATEGORY_GROUP_TYPES,
  listCategoryGroups,
  type CategoryGroup,
  type CategoryGroupType,
} from '../categories';
import type { ServiceContext } from '../context';
import { runWidgetQuery, type ReportTable } from '../reporting';
import type { WidgetQuery } from '../reporting/query';
import { cellOf, periodRow, sumOf, type FigureRow } from './figures';
import type { AnalyticsPeriod } from './window';

/**
 * Analytics' Categories per period table: every Category of the three Category group types,
 * under its Category group (Income groups first, then Expense, then Capital), per period of the
 * window, with a subtotal per group. Categories with nothing booked in the window are hidden,
 * and so is a group left with none. Signed CHF amounts, as booked: a refund nets within its
 * Category, Split lines count by their own Category and Transfers are left out (the reporting
 * engine's base rows).
 */

export interface CategoryGroupRows {
  groupId: string;
  name: string;
  type: CategoryGroupType;
  /** The group's Categories in their order, each a row keyed by its id. */
  categories: FigureRow[];
  /** The group's figures: its Categories added up, drilled with the group as a filter. */
  subtotal: FigureRow;
}

export interface CategoriesPerPeriod {
  periods: AnalyticsPeriod[];
  groups: CategoryGroupRows[];
  /** No classified Transaction falls in the window. */
  isEmpty: boolean;
  /** Transactions left out for want of an FX rate. */
  unconvertedCount: number;
}

/** A group's rows, or null when none of its Categories has anything in the window. */
function groupRows(
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
  report: ReportTable,
  group: CategoryGroup,
): CategoryGroupRows | null {
  const cell = cellOf(report);
  const booked = new Set(report.rows.map((row) => row.key));
  const shown = group.categories.filter((category) => booked.has(category.id));
  if (shown.length === 0) return null;
  const categories = shown.map((category) =>
    periodRow(view, window, {
      key: category.id,
      label: category.name,
      query: report.query,
      row: category.id,
      valueAt: (period) => cell(category.id, period),
    }),
  );
  const groupQuery: WidgetQuery = {
    ...report.query,
    filters: { ...report.query.filters, categoryGroupIds: [group.id] },
  };
  const subtotal = periodRow(view, window, {
    key: `group:${group.id}`,
    label: group.name,
    query: groupQuery,
    valueAt: (period) => sumOf(shown.map((category) => cell(category.id, period))),
  });
  return { groupId: group.id, name: group.name, type: group.type, categories, subtotal };
}

const typeRank = (type: CategoryGroupType) => CATEGORY_GROUP_TYPES.indexOf(type);

export async function categoriesPerPeriod(
  ctx: ServiceContext,
  view: PeriodView,
  window: readonly AnalyticsPeriod[],
): Promise<CategoriesPerPeriod> {
  const [report, groups] = await Promise.all([
    runWidgetQuery(ctx, {
      filters: { categoryGroupTypes: [...CATEGORY_GROUP_TYPES] },
      dateRange: windowRange(view),
      rows: 'category',
      columns: view,
    }),
    listCategoryGroups(ctx),
  ]);
  const ordered = [...groups].sort((a, b) => typeRank(a.type) - typeRank(b.type));
  return {
    periods: [...window],
    groups: ordered.flatMap((group) => groupRows(view, window, report, group) ?? []),
    isEmpty: report.total === null,
    unconvertedCount: report.unconvertedCount,
  };
}
