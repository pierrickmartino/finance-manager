import type { ReportHeader } from '@/server/services/reporting/headers';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A row or column's label, a running Interval set apart (GLOSSARY: Interval): today is
 * "to date", a month, quarter or year still running "partial".
 */
export function intervalLabel(header: Pick<ReportHeader, 'key' | 'label' | 'isPartial'>): string {
  if (!header.isPartial) return header.label;
  return `${header.label} ${header.key !== null && DAY_KEY.test(header.key) ? '(to date)' : '(partial)'}`;
}
