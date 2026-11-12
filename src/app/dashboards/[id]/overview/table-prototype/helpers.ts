/*
 * PROTOTYPE — throwaway. Small helpers the table-card variants share (formatting only; each
 * variant owns its own layout).
 */

import { useFormatter } from '@/components/formatter-provider';
import type { ChartSource } from '@/lib/reporting/chart-data';
import type { ReportHeader } from '@/server/services/reporting';

export type Format = (value: number) => string;

/** Whole CHF for amounts, a plain number for counts. */
export function useValueFormat(data: ChartSource): Format {
  const fmt = useFormatter();
  return (value) =>
    data.measure === 'count'
      ? String(value)
      : fmt.amount(value, { currency: 'CHF', isWhole: true });
}

/** "Oct 2026" → "Oct"; non-period labels unchanged. */
export function shortLabel(header: ReportHeader): string {
  const short = /^[A-Z][a-z]{2} \d{4}$/.test(header.label)
    ? header.label.slice(0, 3)
    : header.label;
  return header.isPartial ? `${short}*` : short;
}

/** Row indexes, largest absolute row total first. */
export function rankedRows(data: ChartSource): number[] {
  return data.rows
    .map((_, r) => r)
    .sort((a, b) => Math.abs(data.rowTotals[b] ?? 0) - Math.abs(data.rowTotals[a] ?? 0));
}

export function maxAbs(values: (number | null)[]): number {
  return Math.max(1, ...values.map((value) => Math.abs(value ?? 0)));
}
