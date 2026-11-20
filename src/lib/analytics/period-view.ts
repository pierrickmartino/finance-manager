import type { DateRange, TimeAxis } from '@/server/services/reporting/query';

/**
 * The Period view Analytics is read at (GLOSSARY: Period view), and its Period window: the last
 * 6 years, 8 quarters or 12 months, always ending with the current period. Pure, so the page,
 * its links and the Analytics service share it.
 */

export const PERIOD_VIEWS = ['year', 'quarter', 'month'] as const satisfies readonly TimeAxis[];
export type PeriodView = (typeof PERIOD_VIEWS)[number];

/** The view Analytics opens on: the most detailed one. */
export const DEFAULT_PERIOD_VIEW: PeriodView = 'month';

export const PERIOD_VIEW_LABELS: Record<PeriodView, string> = {
  year: 'Year',
  quarter: 'Quarter',
  month: 'Month',
};

/** How many periods each view's window shows, the current one included. */
export const WINDOW_LENGTHS: Record<PeriodView, number> = { year: 6, quarter: 8, month: 12 };

export function isPeriodView(value: unknown): value is PeriodView {
  return (PERIOD_VIEWS as readonly unknown[]).includes(value);
}

/** The `period` URL parameter read back: a missing or unknown value is Month. */
export function parsePeriodView(value: string | string[] | undefined): PeriodView {
  const first = Array.isArray(value) ? value[0] : value;
  return isPeriodView(first) ? first : DEFAULT_PERIOD_VIEW;
}

/** Analytics at a Period view. */
export function analyticsHref(view: PeriodView): string {
  return `/analytics?period=${view}`;
}

/**
 * The window as a reporting date range: the complete periods before the current one, then the
 * current one, to today.
 */
export function windowRange(view: PeriodView): DateRange {
  return { kind: 'last', count: WINDOW_LENGTHS[view] - 1, unit: view, includeCurrent: true };
}
