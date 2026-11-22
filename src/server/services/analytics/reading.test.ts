import { describe, expect, it } from 'vitest';
import { presetSpan, type Span } from '@/lib/analytics/span';
import { isIncomplete, readingOf, type AnalyticsPeriod } from './reading';

/** The reading every section of Analytics reads (ADR-0016): pure, given today. */

const custom = (from: string): Span => ({ kind: 'custom', from });
const period = (flags: Partial<AnalyticsPeriod>): AnalyticsPeriod => ({
  key: '2025-03',
  label: 'Mar 2025',
  isToDate: false,
  isPartial: false,
  ...flags,
});

describe('readingOf', () => {
  it('reads Rolling 90 days by month, its first month cut short and the last to date', () => {
    const reading = readingOf(presetSpan('rolling-90-days'), '2026-11-22');

    expect(reading).toMatchObject({
      span: presetSpan('rolling-90-days'),
      from: '2026-08-25',
      to: '2026-11-22',
      grain: 'month',
      range: { kind: 'fixed', from: '2026-08-25', to: '2026-11-22' },
    });
    expect(reading.periods).toEqual([
      { key: '2026-08', label: 'Aug 2026', isToDate: false, isPartial: true },
      { key: '2026-09', label: 'Sep 2026', isToDate: false, isPartial: false },
      { key: '2026-10', label: 'Oct 2026', isToDate: false, isPartial: false },
      { key: '2026-11', label: 'Nov 2026', isToDate: true, isPartial: false },
    ]);
  });

  it('cuts nothing short when the Span starts on its first period’s first day', () => {
    const { grain, periods } = readingOf(presetSpan('this-year-and-last-4'), '2026-11-22');

    expect(grain).toBe('year');
    expect(periods.map((p) => p.key)).toEqual(['2022', '2023', '2024', '2025', '2026']);
    expect(periods.some((p) => p.isPartial)).toBe(false);
  });

  it('reads a single day as one period, both to date and whole', () => {
    expect(readingOf(custom('2026-11-01'), '2026-11-01').periods).toEqual([
      { key: '2026-11', label: 'Nov 2026', isToDate: true, isPartial: false },
    ]);
  });

  it('starts a preset at the first Transaction when it is later, keeping the preset', () => {
    const reading = readingOf(presetSpan('this-year-and-last-4'), '2026-11-22', '2026-03-10');

    expect(reading).toMatchObject({
      span: presetSpan('this-year-and-last-4'),
      from: '2026-03-10',
      grain: 'month',
    });
    expect(reading.periods[0]).toMatchObject({ key: '2026-03', isPartial: true });
  });

  it('moves a custom start date to the first Transaction when it is later', () => {
    expect(readingOf(custom('2020-01-01'), '2026-11-22', '2026-03-10')).toMatchObject({
      span: custom('2026-03-10'),
      from: '2026-03-10',
    });
  });

  it('leaves a Span starting on or after the first Transaction as it is', () => {
    expect(readingOf(custom('2026-03-10'), '2026-11-22', '2026-03-10').from).toBe('2026-03-10');
    expect(readingOf(presetSpan('year-to-date'), '2026-11-22', '2020-05-01').from).toBe(
      '2026-01-01',
    );
  });

  it('never starts after today, even when the first Transaction is booked later', () => {
    expect(readingOf(presetSpan('year-to-date'), '2026-11-22', '2026-12-05').from).toBe(
      '2026-11-22',
    );
  });
});

describe('isIncomplete', () => {
  it('sets apart a period cut short or to date, and no complete one', () => {
    expect(isIncomplete(period({ isPartial: true }))).toBe(true);
    expect(isIncomplete(period({ isToDate: true }))).toBe(true);
    expect(isIncomplete(period({}))).toBe(false);
  });
});
