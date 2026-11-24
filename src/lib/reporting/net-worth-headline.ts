import type { TimeAxis } from '@/server/services/reporting/query';
import type { ChartSource } from './chart-data';
import { periodValues, type PeriodValue } from './period-values';

/**
 * Net worth under the overview's headline (GLOSSARY: Dashboard Story): a sparkline of every
 * Account's Net worth by period (months on the Dashboard), and its change since the end of the
 * previous period and over the last year and two years. Amounts in minor units.
 */

/** How far back each change looks, in months before the latest point. */
const CHANGE_MONTHS = { '1M': 1, '1Q': 3, '1Y': 12, '2Y': 24 } as const;

type ChangeLabel = keyof typeof CHANGE_MONTHS;

type MonthAxis = Exclude<TimeAxis, 'day'>;

/** The changes a trend of each period tells: the previous period's end first. */
const CHANGES: Record<MonthAxis, readonly ChangeLabel[]> = {
  month: ['1M', '1Y', '2Y'],
  quarter: ['1Q', '1Y', '2Y'],
  year: ['1Y', '2Y'],
};

const MONTHS_PER: Record<MonthAxis, number> = { month: 1, quarter: 3, year: 12 };

/** Net worth now against the point `months` months before the latest. */
export interface HeadlineChange {
  label: ChangeLabel;
  months: number;
  /** The earlier point's label: the month at whose end it stands. */
  since: string;
  /** The latest point less the earlier one. */
  change: number;
  /** The Accounts as of the earlier point's date. */
  href: string;
}

/** The sparkline's points, the latest standing at today, and the changes it holds. */
export interface HeadlineTrend {
  points: PeriodValue[];
  changes: HeadlineChange[];
}

/**
 * The headline's trend from a Net worth table whose rows are `period`s (months by default). The months before its first Net worth
 * have no data (no Account open yet): they are left out of the line, and a change reaching
 * further back than the line's first point is left out too, so every change is read off a
 * point the sparkline draws.
 */
export function readHeadlineTrend(data: ChartSource, period: TimeAxis = 'month'): HeadlineTrend {
  const all = periodValues(data);
  const first = all.findIndex((point) => point.value !== 0);
  if (first < 0) return { points: [], changes: [] };
  const points = all.slice(first);
  const latest = points.at(-1)!;
  // A trend by day counts no months back, so it tells no change.
  if (period === 'day') return { points, changes: [] };
  const changes = CHANGES[period].flatMap((label) => {
    const months = CHANGE_MONTHS[label];
    const then = points.at(-1 - months / MONTHS_PER[period]);
    if (!then) return [];
    return [
      { label, months, since: then.label, change: latest.value - then.value, href: then.href },
    ];
  });
  return { points, changes };
}

/** A sparkline drawn in a 100 × 100 box (x across, y down from the top). */
export interface Sparkline {
  line: string;
  /** The line closed down to the box's bottom, to fill under it. */
  area: string;
  /** Where each value sits, in order. */
  spots: { x: number; y: number }[];
}

/** Room left above the highest point and below the lowest, in percent of the box. */
const PAD = 10;

/**
 * The line through `values`, evenly spaced across, fitted between their own low and high (not
 * zero) so a short span still shows its shape; a flat line runs across the middle.
 */
export function sparkline(values: readonly number[]): Sparkline | null {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const span = Math.max(...values) - low;
  const x = (i: number) => (i * 100) / (values.length - 1);
  const y = (value: number) =>
    span === 0 ? 50 : PAD + ((low + span - value) / span) * (100 - 2 * PAD);
  const spots = values.map((value, i) => ({ x: x(i), y: y(value) }));
  const line = `M${spots.map((spot) => `${spot.x},${spot.y}`).join(' L')}`;
  return { line, area: `${line} L100,100 L0,100 Z`, spots };
}
