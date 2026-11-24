import { describe, expect, it } from 'vitest';
import { presetPeriod, periodStart, type Period } from '@/lib/analytics/period';
import { comparisonPeriod } from './comparison-period';

/** The Comparison period of a Period (GLOSSARY; spec #204, ticket #235). */

/** The Comparison period of a Period read from its own start to `today`. */
const comparedOn = (period: Period, today: string) =>
  comparisonPeriod(period, { from: periodStart(period, today), to: today });

describe('comparisonPeriod', () => {
  it('compares Quarter to date with as many days into the previous quarter', () => {
    // 22 November is the 53rd day of Q4; the 53rd of Q3 is 22 August.
    expect(comparedOn(presetPeriod('quarter-to-date'), '2026-11-22')).toEqual({
      from: '2026-07-01',
      to: '2026-08-22',
    });
  });

  it('compares Quarter to date on the last day of a longer quarter with the whole previous one', () => {
    // Q3 has 92 days, Q2 91.
    expect(comparedOn(presetPeriod('quarter-to-date'), '2025-09-30')).toEqual({
      from: '2025-04-01',
      to: '2025-06-30',
    });
  });

  it('compares Year to date with the same dates last year', () => {
    expect(comparedOn(presetPeriod('year-to-date'), '2026-11-22')).toEqual({
      from: '2025-01-01',
      to: '2025-11-22',
    });
  });

  it('compares Year to date on 29 February up to 28 February last year', () => {
    expect(comparedOn(presetPeriod('year-to-date'), '2024-02-29')).toEqual({
      from: '2023-01-01',
      to: '2023-02-28',
    });
  });

  it('compares this-year-and-last-2 with the same dates of the three years before', () => {
    // 1 Jan 2024 – 22 Nov 2026: three calendar years to date, the three before them.
    expect(comparedOn(presetPeriod('this-year-and-last-2'), '2026-11-22')).toEqual({
      from: '2021-01-01',
      to: '2023-11-22',
    });
  });

  it('compares this-year-and-last-1 on 29 February up to 28 February', () => {
    expect(comparedOn(presetPeriod('this-year-and-last-1'), '2028-02-29')).toEqual({
      from: '2025-01-01',
      to: '2026-02-28',
    });
  });

  it('compares Last 90 days with the 90 days just before it', () => {
    // 25 Aug – 22 Nov 2026.
    expect(comparedOn(presetPeriod('rolling-90-days'), '2026-11-22')).toEqual({
      from: '2026-05-27',
      to: '2026-08-24',
    });
  });

  it('compares Last 12 months with the 365 days before it', () => {
    // 23 Nov 2025 – 22 Nov 2026.
    expect(comparedOn(presetPeriod('rolling-12-months'), '2026-11-22')).toEqual({
      from: '2024-11-23',
      to: '2025-11-22',
    });
  });

  it('compares a custom Period with as many days just before its start', () => {
    // 1–22 November: 22 days, so 10–31 October.
    expect(comparedOn({ kind: 'custom', from: '2026-11-01' }, '2026-11-22')).toEqual({
      from: '2026-10-10',
      to: '2026-10-31',
    });
  });

  it('compares a rolling Period read from a later start than its preset gives by the days read', () => {
    // Last 90 days moved to a first Transaction on 1 November: 1–22 November is read.
    expect(
      comparisonPeriod(presetPeriod('rolling-90-days'), { from: '2026-11-01', to: '2026-11-22' }),
    ).toEqual({ from: '2026-10-10', to: '2026-10-31' });
  });
});
