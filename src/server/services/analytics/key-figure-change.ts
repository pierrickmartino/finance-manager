import { accountsHref } from '@/lib/accounts/links';
import { analyticsDrillUrl } from '@/lib/analytics/links';
import type { PeriodView } from '@/lib/analytics/period-view';
import type { ServiceContext } from '../context';
import { addDays } from '../fx/dates';
import { runWidgetQuery, type ReportTable } from '../reporting';
import type { CellRef } from '../reporting/cell-ref';
import { periodKey, periodOf, type DateSpan } from '../reporting/periods';
import type { WidgetQueryInput } from '../reporting/query';
import { comparisonLabel, comparisonSpan } from './comparison-span';
import { flowFigures, type FlowFigureId } from './flow-figures';

/**
 * A Key figure's change line (spec #225): Income, Expense and Profit against the same figure
 * over the Comparison span (GLOSSARY), Net worth against its value at the end of the previous
 * period. There is no change when the Account data doesn't reach back to what it is compared
 * with: the Comparison span's start, or for Net worth the previous period's end.
 */

export type ChangeDirection = 'up' | 'down' | 'flat';

/** Which way up counts as good: up for Income, Profit and Net worth, down for Expense. */
export type GoodWay = 'up' | 'down';

export interface KeyFigureChange {
  /** The figure less its earlier value, in CHF minor units. */
  amount: number;
  /** The change as a share of the earlier value (0.25 for +25%); null unless it is above zero. */
  percent: number | null;
  direction: ChangeDirection;
  /** Whether the change is good for this figure; null when it has not moved. */
  isGood: boolean | null;
  /** Those dates as the line says them: "vs 1–22 Oct". */
  label: string;
  /**
   * The Transactions of both stretches of days (the current period to date and the Comparison
   * span), or for Net worth the Accounts at the end of the previous period.
   */
  href: string;
}

export type { FlowFigureId } from './flow-figures';

/** The cell of the comparison report each flow figure is. */
const FLOW_CELLS: Record<FlowFigureId, CellRef> = {
  income: { column: 'income', withPeriodSubtotals: true },
  expense: { column: 'expense', withPeriodSubtotals: true },
  // The report holds only Income and Expense groups: its total is both of them.
  profit: { withPeriodSubtotals: true },
};

/** Which way each flow figure is good: more spending is never good. */
const FLOW_GOOD_WAYS: Record<FlowFigureId, GoodWay> = {
  income: 'up',
  expense: 'down',
  profit: 'up',
};

/** What a Key figure's change is read from, at a Period view on a day. */
export interface Comparison {
  view: PeriodView;
  today: string;
  /** The Comparison span. */
  span: DateSpan;
  /** The first day any Account holds data; null when none does. */
  dataStart: string | null;
  /** Income and expense of both stretches, a row per period: the earlier one is the first. */
  report: ReportTable;
}

const directionOf = (amount: number): ChangeDirection =>
  amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat';

function changeOf(
  [value, earlier]: readonly [value: number, earlier: number],
  { span, today, goodWay, href }: { span: DateSpan; today: string; goodWay: GoodWay; href: string },
): KeyFigureChange {
  const amount = value - earlier;
  const direction = directionOf(amount);
  return {
    amount,
    percent: earlier > 0 ? amount / earlier : null,
    direction,
    isGood: direction === 'flat' ? null : direction === goodWay,
    label: comparisonLabel(span, today),
    href,
  };
}

/**
 * Income and expense over both stretches, by period of the view: from the Comparison span's
 * start to today, leaving out the days between the two stretches.
 */
function bothStretchesQuery(view: PeriodView, span: DateSpan, current: DateSpan): WidgetQueryInput {
  const gap = { from: addDays(span.to, 1), to: addDays(current.from, -1) };
  return {
    filters: { categoryGroupTypes: ['income', 'expense'] },
    dateRange: {
      kind: 'fixed',
      from: span.from,
      to: current.to,
      ...(gap.from <= gap.to ? { except: gap } : {}),
    },
    rows: view,
    columns: 'categoryGroupType',
  };
}

/**
 * The first day any Account holds data: its opening date, or its first Transaction. Null when
 * no Account has either.
 */
async function accountDataStart(ctx: ServiceContext): Promise<string | null> {
  const result = await ctx.db.query<{ start: string | null }>(
    `SELECT to_char(least(
       (SELECT min(opening_date) FROM account),
       (SELECT min(booking_date) FROM "transaction")
     ), 'YYYY-MM-DD') AS start`,
  );
  return result.rows[0]?.start ?? null;
}

/** Starts reading what the Key figures' changes compare with, at a Period view on `today`. */
export async function loadComparison(
  ctx: ServiceContext,
  view: PeriodView,
  today: string,
): Promise<Comparison> {
  const span = comparisonSpan(view, today);
  const current = { from: periodOf(today, view).from, to: today };
  const [report, start] = await Promise.all([
    runWidgetQuery(ctx, bothStretchesQuery(view, span, current)),
    accountDataStart(ctx),
  ]);
  return { view, today, span, dataStart: start, report };
}

const reachesBack = ({ dataStart }: Comparison, date: string) =>
  dataStart !== null && dataStart <= date;

/** A comparison report's value at the earlier period's row, in one Category group type. */
function earlierOf(comparison: Comparison, type: 'income' | 'expense'): number {
  const { report, span, view } = comparison;
  const row = report.rows.findIndex((header) => header.key === periodKey(span.from, view));
  const column = report.columns.findIndex((header) => header.key === type);
  return row < 0 || column < 0 ? 0 : (report.cells[row]?.[column] ?? 0);
}

/** A flow figure's change against the Comparison span; null when the data doesn't reach back. */
export function flowChange(
  comparison: Comparison,
  id: FlowFigureId,
  value: number,
): KeyFigureChange | null {
  if (!reachesBack(comparison, comparison.span.from)) return null;
  const earlier = flowFigures(earlierOf(comparison, 'income'), earlierOf(comparison, 'expense'))[
    id
  ];
  const { view, today, span, report } = comparison;
  return changeOf([value, earlier], {
    span,
    today,
    goodWay: FLOW_GOOD_WAYS[id],
    href: analyticsDrillUrl(view, report.query, FLOW_CELLS[id]),
  });
}

/**
 * Net worth's change against its value at the end of the previous period, read off the Net
 * worth trend (a point per period end, then today); null when the data doesn't reach back.
 */
export function netWorthChange(
  comparison: Comparison,
  trend: ReportTable,
  value: number,
): KeyFigureChange | null {
  const { view, today } = comparison;
  const end = addDays(periodOf(today, view).from, -1);
  if (!reachesBack(comparison, end)) return null;
  const row = trend.rows.findIndex((header) => header.key === periodKey(end, view));
  if (row < 0) return null;
  return changeOf([value, trend.rowTotals[row] ?? 0], {
    span: { from: end, to: end },
    today,
    goodWay: 'up',
    href: accountsHref({ date: end }),
  });
}
