import type { DateRange, TimeAxis } from './query';

/** Inclusive ISO date span. */
export interface DateSpan {
  from: string;
  to: string;
}

const MONTHS_PER: Record<TimeAxis, number> = { month: 1, quarter: 3, year: 12 };

interface YearMonth {
  year: number;
  /** 0-based. */
  month: number;
}

function parseYearMonth(iso: string): YearMonth {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
}

function monthIndex({ year, month }: YearMonth): number {
  return year * 12 + month;
}

function firstDay(index: number): string {
  const year = Math.floor(index / 12);
  const month = index % 12;
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-01`;
}

function lastDay(index: number): string {
  const next = Date.parse(`${firstDay(index + 1)}T00:00:00Z`);
  return new Date(next - 86_400_000).toISOString().slice(0, 10);
}

/** Month index of the first month of the period containing `index`. */
function periodStartIndex(index: number, unit: TimeAxis): number {
  const size = MONTHS_PER[unit];
  return index - (index % size);
}

/** The period of `unit` that contains `date`, as an inclusive span. */
export function periodOf(date: string, unit: TimeAxis): DateSpan {
  const start = periodStartIndex(monthIndex(parseYearMonth(date)), unit);
  return { from: firstDay(start), to: lastDay(start + MONTHS_PER[unit] - 1) };
}

/** Axis key of the period containing `date`: `2025-03`, `2025-Q1` or `2025`. */
export function periodKey(date: string, unit: TimeAxis): string {
  const { year, month } = parseYearMonth(date);
  if (unit === 'month') return date.slice(0, 7);
  if (unit === 'quarter') return `${year}-Q${Math.floor(month / 3) + 1}`;
  return String(year);
}

/** The span a period key covers (inverse of `periodKey`). */
export function periodSpan(key: string, unit: TimeAxis): DateSpan {
  if (unit === 'month') return periodOf(`${key}-01`, 'month');
  if (unit === 'quarter') {
    const quarter = Number(key.slice(6));
    return periodOf(`${key.slice(0, 4)}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`, unit);
  }
  return periodOf(`${key}-01-01`, 'year');
}

/** Every period of `unit` that overlaps the span, oldest first. */
export function periodsIn(span: DateSpan, unit: TimeAxis): string[] {
  if (span.from > span.to) return [];
  const size = MONTHS_PER[unit];
  const first = periodStartIndex(monthIndex(parseYearMonth(span.from)), unit);
  const last = monthIndex(parseYearMonth(span.to));
  const keys: string[] = [];
  for (let index = first; index <= last; index += size) keys.push(periodKey(firstDay(index), unit));
  return keys;
}

/** The overlap of two spans, or null when they don't overlap. */
export function intersect(a: DateSpan, b: DateSpan): DateSpan | null {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  return from <= to ? { from, to } : null;
}

/** The dates a range covers on `today`, and the current partial period when it is included. */
export interface ResolvedRange {
  /** Inclusive. Empty (from after to) when a live range has no complete period yet. */
  range: DateSpan;
  /** The current, incomplete period, when the range includes it (spec 101). */
  partialPeriod: DateSpan | null;
}

/**
 * Resolves a date range on `today` (a Swiss calendar day). Live ranges cover complete periods
 * only, ending with the last one before today's; `includeCurrent` appends today's period up to
 * today, flagged as partial.
 */
export function resolveRange(range: DateRange, today: string): ResolvedRange {
  if (range.kind === 'fixed') return { range: { from: range.from, to: range.to }, partialPeriod: null };

  const unit: TimeAxis = range.kind === 'last' ? range.unit : 'month';
  const current = periodOf(today, unit);
  const currentStart = periodStartIndex(monthIndex(parseYearMonth(today)), unit);
  const from =
    range.kind === 'last'
      ? firstDay(currentStart - range.count * MONTHS_PER[unit])
      : `${today.slice(0, 4)}-01-01`;
  if (range.includeCurrent) {
    return { range: { from, to: today }, partialPeriod: { from: current.from, to: today } };
  }
  return { range: { from, to: lastDay(currentStart - 1) }, partialPeriod: null };
}
