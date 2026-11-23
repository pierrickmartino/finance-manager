import { accountsHref } from '@/lib/accounts/links';
import { analyticsDrillUrl } from '@/lib/analytics/links';
import type { ServiceContext } from '../context';
import { addDays } from '../fx/dates';
import { runWidgetQuery, type ReportTable } from '../reporting';
import type { CellRef } from '../reporting/cell-ref';
import { periodKey, periodOf, type DateSpan } from '../reporting/periods';
import type { WidgetQueryInput } from '../reporting/query';
import { byGroupType, typeTotal } from './by-group-type';
import { comparisonLabel, comparisonPeriod } from './comparison-period';
import { flowFigures, type FlowFigureId } from './flow-figures';
import type { AnalyticsReading } from './reading';

/**
 * A Key figure's change line (spec #225, #204): Income, Expense and Profit over the Period against
 * the same figure over its Comparison period (GLOSSARY), Net worth against its value at the end of
 * the previous interval. There is no change when the Account data doesn't reach back to what it is
 * compared with: the Comparison period's start, or for Net worth the previous interval's end.
 */

export type ChangeDirection = 'up' | 'down' | 'flat';

/**
 * Which direction of change is good: up for Income, Profit and Net worth, down for Expense;
 * neither for a figure whose moves are neither good nor bad (the Profit and loss's Capital and
 * Unclassified).
 */
export type GoodDirection = 'up' | 'down' | 'neither';

export interface KeyFigureChange {
  /** The figure less its earlier value, in CHF minor units. */
  amount: number;
  /** The change as a share of the earlier value (0.25 for +25%); null unless it is above zero. */
  percent: number | null;
  direction: ChangeDirection;
  /**
   * Whether the change is good for this figure; null when it is neither good nor bad: the figure
   * has not moved, or no direction is good for it.
   */
  isGood: boolean | null;
  /** Those dates as the line says them: "vs 1–22 Oct". */
  label: string;
  /**
   * The Transactions of both stretches of days (the Period and its Comparison period), or for Net
   * worth the Accounts at the end of the previous interval.
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

/** The Key figures' flows: only the Income and Expense Category groups. */
const INCOME_AND_EXPENSE: BothStretchesFlows = {
  filters: { categoryGroupTypes: ['income', 'expense'] },
};

/** Which way each flow figure is good: more spending is never good. */
const FLOW_GOOD_DIRECTIONS: Record<FlowFigureId, GoodDirection> = {
  income: 'up',
  expense: 'down',
  profit: 'up',
};

/** What a Key figure's change is read from, over a reading. */
export interface Comparison {
  reading: AnalyticsReading;
  /** The Comparison period. */
  period: DateSpan;
  /** The first day any Account holds data; null when none does. */
  dataStart: string | null;
  /** Income and expense of both stretches, a row per interval: what a change line opens. */
  report: ReportTable;
  /**
   * Every flow of the Comparison period, a row per Category group type (`byGroupType`): Income and
   * Expense for the Key figures, and Capital and Unclassified too for the Profit and loss.
   */
  earlier: ReportTable;
}

const directionOf = (amount: number): ChangeDirection =>
  amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat';

function changeOf(
  [value, earlier]: readonly [value: number, earlier: number],
  {
    period,
    today,
    goodDirection,
    href,
  }: { period: DateSpan; today: string; goodDirection: GoodDirection; href: string },
): KeyFigureChange {
  const amount = value - earlier;
  const direction = directionOf(amount);
  return {
    amount,
    percent: earlier > 0 ? amount / earlier : null,
    direction,
    isGood:
      direction === 'flat' || goodDirection === 'neither' ? null : direction === goodDirection,
    label: comparisonLabel(period, today),
    href,
  };
}

/** What any change against the Comparison period is read over. */
export type ComparisonWindow = Pick<Comparison, 'reading' | 'period' | 'dataStart'>;

/** Which flows a both-stretches query reads: a Category group type filter, Capital or not. */
export type BothStretchesFlows = Pick<WidgetQueryInput, 'filters' | 'includeCapital'>;

/**
 * Some flows over both stretches of days, by interval of the grain, a column per Category group
 * type: what a change line opens. From the Comparison period's start to today, leaving out the
 * days between the two stretches.
 */
export function bothStretchesQuery(
  { reading, period }: ComparisonWindow,
  flows: BothStretchesFlows,
): WidgetQueryInput {
  const gap = { from: addDays(period.to, 1), to: addDays(reading.from, -1) };
  return {
    ...flows,
    dateRange: {
      kind: 'fixed',
      from: period.from,
      to: reading.to,
      ...(gap.from <= gap.to ? { except: gap } : {}),
    },
    rows: reading.grain,
    columns: 'categoryGroupType',
  };
}

/**
 * Starts reading what the Key figures' and the Profit and loss's changes compare with, over a
 * reading, given the first day any Account holds data (`DataStart.accountData`).
 */
export async function loadComparison(
  ctx: ServiceContext,
  reading: AnalyticsReading,
  dataStart: string | null,
): Promise<Comparison> {
  const period = comparisonPeriod(reading.period, { from: reading.from, to: reading.to });
  const window = { reading, period, dataStart };
  const [report, earlier] = await Promise.all([
    runWidgetQuery(ctx, bothStretchesQuery(window, INCOME_AND_EXPENSE)),
    runWidgetQuery(ctx, byGroupType({ kind: 'fixed', from: period.from, to: period.to })),
  ]);
  return { ...window, report, earlier };
}

const reachesBack = ({ dataStart }: Pick<Comparison, 'dataStart'>, date: string) =>
  dataStart !== null && dataStart <= date;

/**
 * A figure's change against its value over the Comparison period, opening `href` (the Transactions
 * of both stretches); null when the Account data doesn't reach back to the Comparison period.
 */
export function periodChange(
  { reading, period, dataStart }: ComparisonWindow,
  values: readonly [value: number, earlier: number],
  { goodDirection, href }: { goodDirection: GoodDirection; href: string },
): KeyFigureChange | null {
  if (!reachesBack({ dataStart }, period.from)) return null;
  return changeOf(values, { period, today: reading.to, goodDirection, href });
}

/** A flow figure's change against the Comparison period; null when the data doesn't reach back. */
export function flowChange(
  comparison: Comparison,
  id: FlowFigureId,
  value: number,
): KeyFigureChange | null {
  const { earlier: before } = comparison;
  const earlier = flowFigures(typeTotal(before, 'income'), typeTotal(before, 'expense'))[id];
  const { reading, report } = comparison;
  return periodChange(comparison, [value, earlier], {
    goodDirection: FLOW_GOOD_DIRECTIONS[id],
    href: analyticsDrillUrl(reading, report.query, FLOW_CELLS[id]),
  });
}

/**
 * Net worth's change against its value at the end of the previous interval, read off the Net
 * worth trend (a point per interval end, then today); null when the data doesn't reach back.
 */
export function netWorthChange(
  comparison: Comparison,
  trend: ReportTable,
  value: number,
): KeyFigureChange | null {
  const { grain, to: today } = comparison.reading;
  const end = addDays(periodOf(today, grain).from, -1);
  if (!reachesBack(comparison, end)) return null;
  const row = trend.rows.findIndex((header) => header.key === periodKey(end, grain));
  if (row < 0) return null;
  return changeOf([value, trend.rowTotals[row] ?? 0], {
    period: { from: end, to: end },
    today,
    goodDirection: 'up',
    href: accountsHref({ date: end }),
  });
}
