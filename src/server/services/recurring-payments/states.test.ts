import { describe, expect, it } from 'vitest';
import type { CadenceRule } from './cadences';
import { graceDays, isEndedOn, lastDayBeforeEnded } from './states';

/** A cadence of `months` months, as a row of the cadence table would give it. */
const every = (months: number): CadenceRule => ({ cadence: 'monthly', months, minCharges: 2 });

describe('graceDays', () => {
  it('is a quarter of the cadence in whole days', () => {
    expect([1, 3, 6, 12].map((months) => graceDays(every(months)))).toEqual([8, 23, 46, 91]);
  });
});

describe('the Ended date', () => {
  it('is two full cadences after the last charge, clamped to the month end', () => {
    expect(lastDayBeforeEnded(every(1), '2024-12-31')).toBe('2025-02-28');
    expect(lastDayBeforeEnded(every(12), '2024-02-29')).toBe('2026-02-28');
  });

  it('makes the series Ended from the next day on', () => {
    expect(isEndedOn(every(3), '2025-01-15', '2025-07-15')).toBe(false);
    expect(isEndedOn(every(3), '2025-01-15', '2025-07-16')).toBe(true);
  });
});
