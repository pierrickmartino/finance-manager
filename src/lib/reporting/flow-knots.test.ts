import { describe, expect, it } from 'vitest';
import { flowKnots } from './flow-knots';

/** Points keyed by day (`2025-03-01`, …) or by month, the last one partial unless told. */
const days = (count: number, partial: readonly number[] = [count - 1]) =>
  Array.from({ length: count }, (_, i) => ({
    key: new Date(Date.UTC(2025, 2, 1 + i)).toISOString().slice(0, 10),
    isPartial: partial.includes(i),
  }));
const months = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    key: `2025-${String(i + 1).padStart(2, '0')}`,
    isPartial: i === count - 1,
  }));

describe("a line flow's knots, the points its curve passes through", () => {
  it('keeps every point of a flow by any Interval but the day', () => {
    expect(flowKnots(months(5))).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps one day a week by day, counted back from the last, which ends the curve', () => {
    // 22 days: the last (21, partial) and every 7th before it, plus the first and the day
    // before the partial one, where the dashed stretch starts.
    expect(flowKnots(days(22))).toEqual([0, 7, 14, 20, 21]);
  });

  it('spaces them further over a long flow: about a month apart over a year', () => {
    // 366 days: every 29th counting back from today (365, 336, … 17), the first day, and the
    // day before today, where its dashed segment starts.
    const spaced = Array.from({ length: 12 }, (_, k) => 17 + 29 * k);
    expect(flowKnots(days(366))).toEqual([0, ...spaced, 364, 365]);
  });

  it('keeps where a dashed stretch starts or ends: a first day cut short too', () => {
    expect(flowKnots(days(16, [0, 15]))).toEqual([0, 1, 8, 14, 15]);
  });

  it('keeps every day of a flow no longer than a week and a day', () => {
    expect(flowKnots(days(8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the only point, or none', () => {
    expect(flowKnots(days(1))).toEqual([0]);
    expect(flowKnots([])).toEqual([]);
  });
});
