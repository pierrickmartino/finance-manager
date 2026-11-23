import type { RowTree } from '@/lib/reporting/chart-data';
import {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
  listCategoryGroups,
  type CategoryGroup,
} from '../categories';
import type { ServiceContext } from '../context';
import { runWidgetQuery, type ReportTable } from '../reporting';
import type { WidgetQuery } from '../reporting/query';
import {
  analyticsCard,
  cellOf,
  intervalRow,
  intervalRowsSource,
  statusOf,
  sumOf,
  type AnalyticsCard,
  type IntervalRow,
} from './figures';
import type { AnalyticsReading } from './reading';

/**
 * Analytics' Categories per interval, drawn as the Dashboard's heatmap card: each Category group
 * of the three types (Income groups first, then Expense, then Capital) as a subtotal row, then
 * its Categories ("Group › Category"), per interval of the Period and in Total. The rows carry
 * their tree (a section per type, each group over its Categories), so the card draws them
 * indented under their group instead of ranked by size. Categories with
 * nothing booked in the Period are hidden, and so is a group left with none. Signed CHF
 * amounts, as booked: a refund nets within its Category, Split lines count by their own
 * Category and Transfers are left out (the reporting engine's base rows).
 */

export const CATEGORIES_PER_INTERVAL = 'Categories per interval';

/** A group's subtotal row and its Categories' rows, with each Category's own name. */
interface GroupRows {
  group: CategoryGroup;
  subtotal: IntervalRow;
  categories: { row: IntervalRow; name: string }[];
}

/** A group's subtotal then its Categories, or null when none has anything in the Period. */
function groupRows(
  reading: AnalyticsReading,
  report: ReportTable,
  group: CategoryGroup,
): GroupRows | null {
  const cell = cellOf(report);
  const booked = new Set(report.rows.map((row) => row.key));
  const shown = group.categories.filter((category) => booked.has(category.id));
  if (shown.length === 0) return null;
  const categories = shown.map((category) => ({
    name: category.name,
    row: intervalRow(reading, {
      key: category.id,
      label: `${group.name} › ${category.name}`,
      query: report.query,
      selector: category.id,
      valueAt: (interval) => cell(category.id, interval),
    }),
  }));
  // No selector picks several Categories: the subtotal drills the query narrowed to the group.
  const groupQuery: WidgetQuery = {
    ...report.query,
    filters: { ...report.query.filters, categoryGroupIds: [group.id] },
  };
  const subtotal = intervalRow(reading, {
    key: `group:${group.id}`,
    label: group.name,
    query: groupQuery,
    valueAt: (interval) => sumOf(shown.map((category) => cell(category.id, interval))),
  });
  return { group, subtotal, categories };
}

/** The groups' rows flattened in order, and their tree by row index: a section per type. */
function treeOf(groups: readonly GroupRows[]): { rows: IntervalRow[]; tree: RowTree } {
  const rows: IntervalRow[] = [];
  const add = (row: IntervalRow) => rows.push(row) - 1;
  const placed = groups.map((entry) => ({
    type: entry.group.type,
    group: {
      row: add(entry.subtotal),
      children: entry.categories.map(({ row, name }) => ({ row: add(row), label: name })),
    },
  }));
  const sections = CATEGORY_GROUP_TYPES.map((type) => ({
    label: CATEGORY_GROUP_TYPE_LABELS[type],
    groups: placed.filter((entry) => entry.type === type).map((entry) => entry.group),
  })).filter((section) => section.groups.length > 0);
  return { rows, tree: { sections } };
}

const typeRank = (group: CategoryGroup) => CATEGORY_GROUP_TYPES.indexOf(group.type);

export async function categoriesPerInterval(
  ctx: ServiceContext,
  reading: AnalyticsReading,
): Promise<AnalyticsCard> {
  const [report, groups] = await Promise.all([
    runWidgetQuery(ctx, {
      filters: { categoryGroupTypes: [...CATEGORY_GROUP_TYPES] },
      dateRange: reading.range,
      rows: 'category',
      columns: reading.grain,
    }),
    listCategoryGroups(ctx),
  ]);
  const ordered = [...groups].sort((a, b) => typeRank(a) - typeRank(b));
  const shown = ordered
    .map((group) => groupRows(reading, report, group))
    .filter((entry): entry is GroupRows => entry !== null);
  const { rows, tree } = treeOf(shown);
  return analyticsCard({
    id: 'categories-per-interval',
    name: CATEGORIES_PER_INTERVAL,
    visualisation: 'table',
    rows: 'category',
    data: { ...intervalRowsSource(reading, rows, report), rowTree: tree },
    status: statusOf(report),
  });
}
