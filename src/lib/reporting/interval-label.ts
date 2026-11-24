import type { ReportHeader } from '@/server/services/reporting/headers';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a row or column key is a day's (an ISO date), not a month's, quarter's or year's. */
export const isDayKey = (key: string | null): boolean => key !== null && DAY_KEY.test(key);

/**
 * A row or column's label, a running Interval set apart (GLOSSARY: Interval): today is
 * "to date", a month, quarter or year still running "partial".
 */
export function intervalLabel(header: Pick<ReportHeader, 'key' | 'label' | 'isPartial'>): string {
  if (!header.isPartial) return header.label;
  return `${header.label} ${isDayKey(header.key) ? '(to date)' : '(partial)'}`;
}
