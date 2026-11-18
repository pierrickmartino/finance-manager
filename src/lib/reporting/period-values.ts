import type { ChartSource } from './chart-data';

/** One period's total and where it drills down to. */
export interface PeriodValue {
  label: string;
  value: number;
  href: string;
  isPartial: boolean;
}

/** Each row's total (a period, for a trend, bars or Net worth Widget), with its link. */
export function periodValues(data: ChartSource): PeriodValue[] {
  return data.rows.map((row, r) => ({
    label: row.label,
    value: data.rowTotals[r] ?? 0,
    href: data.hrefs.rowTotals[r] ?? data.hrefs.total,
    isPartial: row.isPartial,
  }));
}
