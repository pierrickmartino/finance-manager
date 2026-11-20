import { formatPeriod } from '@/lib/format';
import { windowRange, type PeriodView } from '@/lib/analytics/period-view';
import { periodsIn, resolveRange } from '../reporting/periods';

/** One period of the Period window (GLOSSARY: Period window). */
export interface AnalyticsPeriod {
  /** The reporting period key: `2025-03`, `2025-Q1` or `2025`. */
  key: string;
  label: string;
  /** The current, incomplete period, shown "to date" and left out of averages. */
  isToDate: boolean;
}

/** The Period window of a view on `today`, oldest first; the last period is the current one. */
export function periodWindow(view: PeriodView, today: string): AnalyticsPeriod[] {
  const { range } = resolveRange(windowRange(view), today);
  const keys = periodsIn(range, view);
  return keys.map((key, index) => ({
    key,
    label: formatPeriod(key),
    isToDate: index === keys.length - 1,
  }));
}

/** The keys of the window's complete periods: every one but the current. */
export function completeKeys(window: readonly AnalyticsPeriod[]): string[] {
  return window.filter((period) => !period.isToDate).map((period) => period.key);
}
