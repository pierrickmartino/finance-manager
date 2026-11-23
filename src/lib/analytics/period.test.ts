import { describe, expect, it } from 'vitest';
import {
  analyticsHref,
  cardPeriodsFromParams,
  legacyPeriod,
  PINNABLE_SECTIONS,
  presetPeriod,
  presetStarts,
  periodCaption,
  periodFromParams,
  periodGrain,
  periodPhrase,
  periodStart,
  type Period,
} from './period';

/** The Period model (GLOSSARY: Period, Period preset; ADR-0016), read on a fixed today. */

const preset = presetPeriod;
const custom = (from: string): Period => ({ kind: 'custom', from });

describe('a Period preset', () => {
  it('starts where its name says on 22 Nov 2026', () => {
    expect(presetStarts('2026-11-22')).toEqual({
      'rolling-30-days': '2026-10-24',
      'rolling-60-days': '2026-09-24',
      'rolling-90-days': '2026-08-25',
      'quarter-to-date': '2026-10-01',
      'year-to-date': '2026-01-01',
      'rolling-12-months': '2025-11-23',
      'this-year-and-last-1': '2025-01-01',
      'this-year-and-last-2': '2024-01-01',
      'this-year-and-last-3': '2023-01-01',
      'this-year-and-last-4': '2022-01-01',
    });
  });

  it('starts Rolling 12 months the day after a year earlier, 29 February included', () => {
    expect(periodStart(preset('rolling-12-months'), '2024-02-29')).toBe('2023-03-01');
    expect(periodStart(preset('rolling-12-months'), '2026-01-01')).toBe('2025-01-02');
    expect(periodStart(preset('quarter-to-date'), '2026-03-31')).toBe('2026-01-01');
  });

  it('fills in a start no earlier than the first Transaction', () => {
    expect(presetStarts('2026-11-22', '2026-09-01')).toMatchObject({
      'rolling-30-days': '2026-10-24',
      'quarter-to-date': '2026-10-01',
      'rolling-90-days': '2026-09-01',
      'year-to-date': '2026-09-01',
    });
  });
});

describe("a Period's caption", () => {
  const dates = { from: '2026-01-01', to: '2026-11-22' };

  it("is its preset's name when read from the start it gives", () => {
    expect(periodCaption(preset('year-to-date'), dates)).toBe('Year to date');
  });

  it('is its start date to today for a custom Period, or a preset cut to the data', () => {
    expect(periodCaption(custom('2026-01-01'), dates)).toBe('1 Jan 2026 – today');
    expect(periodCaption(preset('this-year-and-last-1'), dates)).toBe('1 Jan 2026 – today');
  });
});

describe("a Period's grain", () => {
  it('is months up to 13 calendar months, quarters up to 24, years beyond', () => {
    const today = '2026-11-22';

    expect(periodGrain('2026-11-01', today)).toBe('month');
    // Rolling 12 months reaches into 13 calendar months.
    expect(periodGrain('2025-11-23', today)).toBe('month');
    expect(periodGrain('2025-10-31', today)).toBe('quarter');
    expect(periodGrain('2024-12-01', today)).toBe('quarter');
    expect(periodGrain('2024-11-30', today)).toBe('year');
  });
});

describe('the Period in the URL', () => {
  it('reads `period` as its preset, and a missing or unknown one as Rolling 12 months', () => {
    expect(periodFromParams({ period: 'rolling-90-days' }, '2026-11-22')).toEqual(
      preset('rolling-90-days'),
    );
    expect(periodFromParams({ period: ['year-to-date', 'rolling-30-days'] }, '2026-11-22')).toEqual(
      preset('year-to-date'),
    );
    for (const params of [{}, { period: 'rolling-7-days' }, { period: '' }]) {
      expect(periodFromParams(params, '2026-11-22')).toEqual(preset('rolling-12-months'));
    }
  });

  it('reads a valid `from` on or before today as a custom Period', () => {
    const today = '2026-11-22';
    expect(periodFromParams({ from: '2024-03-01' }, today)).toEqual(custom('2024-03-01'));
    expect(periodFromParams({ from: '2026-11-22' }, today)).toEqual(custom('2026-11-22'));
    expect(periodFromParams({ from: ['2025-01-31', '2020-01-01'] }, today)).toEqual(
      custom('2025-01-31'),
    );
  });

  it('keeps a custom start date on a later day, where a preset rolls forward', () => {
    for (const today of ['2026-11-22', '2027-05-03']) {
      expect(periodStart(periodFromParams({ from: '2024-03-01' }, today), today)).toBe(
        '2024-03-01',
      );
    }
    expect(
      periodStart(periodFromParams({ period: 'rolling-30-days' }, '2027-05-03'), '2027-05-03'),
    ).toBe('2027-04-04');
  });

  it('reads a future or malformed `from` as Rolling 12 months', () => {
    const today = '2026-11-22';
    for (const from of ['2026-11-23', '2030-01-01', '2026-02-30', '2026-13-01', '1-3-2024', '']) {
      expect(periodFromParams({ from }, today)).toEqual(preset('rolling-12-months'));
    }
  });

  it('lets a chosen preset win over `from`, and an unknown `period` (Custom) defer to it', () => {
    const today = '2026-11-22';
    expect(periodFromParams({ period: 'year-to-date', from: '2024-03-01' }, today)).toEqual(
      preset('year-to-date'),
    );
    expect(periodFromParams({ period: 'custom', from: '2024-03-01' }, today)).toEqual(
      custom('2024-03-01'),
    );
  });

  it('maps a former Period view `period` to its nearest preset, and anything else to none', () => {
    expect(legacyPeriod({ period: 'month' })).toEqual(preset('rolling-12-months'));
    expect(legacyPeriod({ period: 'quarter' })).toEqual(preset('this-year-and-last-1'));
    expect(legacyPeriod({ period: 'year' })).toEqual(preset('this-year-and-last-4'));
    expect(legacyPeriod({ period: 'week' })).toBeNull();
    expect(legacyPeriod({})).toBeNull();
  });

  it('maps a former Span `span` to its preset, unless a preset `period` is sent beside it', () => {
    expect(legacyPeriod({ span: 'year-to-date' })).toEqual(preset('year-to-date'));
    expect(legacyPeriod({ span: 'year-to-date', period: 'quarter-to-date' })).toBeNull();
    expect(legacyPeriod({ period: 'quarter-to-date' })).toBeNull();
    expect(legacyPeriod({ span: 'nonsense' })).toBeNull();
  });

  it('links Analytics with a preset by its slug, and a custom Period by its start date', () => {
    expect(analyticsHref(preset('quarter-to-date'))).toBe('/analytics?period=quarter-to-date');
    expect(analyticsHref({ kind: 'custom', from: '2024-03-01' })).toBe(
      '/analytics?from=2024-03-01',
    );
  });
});

describe('the Card Periods in the URL', () => {
  /** A URL's search parameters as the page reads them. */
  const paramsOf = (href: string) =>
    Object.fromEntries(new URL(href, 'http://localhost').searchParams);

  it('reserves one parameter per pinnable section, named after it', () => {
    expect(PINNABLE_SECTIONS).toEqual([
      'net-worth',
      'net-cash-flow',
      'spending-by-category',
      'profit-and-loss',
      'income-vs-expense',
      'categories-per-interval',
    ]);
  });

  it('round-trips the page Period and its pins through an Analytics link', () => {
    const pins = {
      'spending-by-category': 'this-year-and-last-2',
      'net-worth': 'year-to-date',
    } as const;
    const href = analyticsHref(preset('rolling-90-days'), pins);

    expect(href).toBe(
      '/analytics?period=rolling-90-days&net-worth=year-to-date&spending-by-category=this-year-and-last-2',
    );
    const params = paramsOf(href);
    expect(periodFromParams(params, '2026-11-22')).toEqual(preset('rolling-90-days'));
    expect(cardPeriodsFromParams(params)).toEqual(pins);
  });

  it('keeps pins beside a custom page Period', () => {
    const href = analyticsHref(custom('2024-03-01'), { 'spending-by-category': 'year-to-date' });

    expect(href).toBe('/analytics?from=2024-03-01&spending-by-category=year-to-date');
    expect(periodFromParams(paramsOf(href), '2026-11-22')).toEqual(custom('2024-03-01'));
    expect(cardPeriodsFromParams(paramsOf(href))).toEqual({
      'spending-by-category': 'year-to-date',
    });
  });

  it('keeps a pin equal to the page Period: a pick is a pin', () => {
    const href = analyticsHref(preset('year-to-date'), { 'spending-by-category': 'year-to-date' });

    expect(cardPeriodsFromParams(paramsOf(href))).toEqual({
      'spending-by-category': 'year-to-date',
    });
  });

  it('has no pins on a bare visit', () => {
    expect(cardPeriodsFromParams({})).toEqual({});
    expect(analyticsHref(preset('rolling-12-months'), {})).toBe(
      '/analytics?period=rolling-12-months',
    );
  });

  it('drops unknown sections, non-pinnable sections and values that are no Period preset', () => {
    expect(
      cardPeriodsFromParams({
        period: 'year-to-date',
        from: '2024-03-01',
        'key-figures': 'year-to-date',
        'spending-insights': 'year-to-date',
        nonsense: 'year-to-date',
        'net-worth': 'week',
        'net-cash-flow': '',
        'profit-and-loss': ['quarter-to-date', 'year-to-date'],
        'spending-by-category': 'custom',
      }),
    ).toEqual({ 'profit-and-loss': 'quarter-to-date' });
  });
});

describe('the Period in words', () => {
  it('names the preset and its dates, the year once when both ends share it', () => {
    expect(periodPhrase(preset('rolling-90-days'), { from: '2026-08-25', to: '2026-11-22' })).toBe(
      'Rolling 90 days · 25 Aug – 22 Nov 2026',
    );
    expect(
      periodPhrase(preset('rolling-12-months'), { from: '2025-11-23', to: '2026-11-22' }),
    ).toBe('Rolling 12 months · 23 Nov 2025 – 22 Nov 2026');
    expect(
      periodPhrase(
        { kind: 'custom', from: '2026-11-22' },
        { from: '2026-11-22', to: '2026-11-22' },
      ),
    ).toBe('Custom · 22 Nov 2026');
  });
});
