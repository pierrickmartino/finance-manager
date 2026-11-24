import { describe, expect, it } from 'vitest';
import {
  analyticsHref,
  cardPeriodsFromParams,
  legacyPeriod,
  PINNABLE_SECTIONS,
  presetLabels,
  presetNameInSentence,
  presetPeriod,
  presetStarts,
  periodCaption,
  periodFromParams,
  periodGrain,
  periodPhrase,
  periodStart,
  unpinnedPage,
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

  it('starts Last 12 months the day after a year earlier, 29 February included', () => {
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

describe("a Period preset's name", () => {
  it('names a rolling Period by its length, and a run of whole years by its first one', () => {
    expect(presetLabels('2026-11-22')).toEqual({
      'rolling-30-days': 'Last 30 days',
      'rolling-60-days': 'Last 60 days',
      'rolling-90-days': 'Last 90 days',
      'quarter-to-date': 'Quarter to date',
      'year-to-date': 'Year to date',
      'rolling-12-months': 'Last 12 months',
      'this-year-and-last-1': 'Since 2025',
      'this-year-and-last-2': 'Since 2024',
      'this-year-and-last-3': 'Since 2023',
      'this-year-and-last-4': 'Since 2022',
    });
  });

  it('ends a sentence as written mid-sentence', () => {
    expect(presetNameInSentence('Last 30 days')).toBe('in the last 30 days');
    expect(presetNameInSentence('Quarter to date')).toBe('in the quarter to date');
    expect(presetNameInSentence('Since 2025')).toBe('since 2025');
  });

  it('moves its year on with the new year', () => {
    expect(presetLabels('2027-01-01')['this-year-and-last-1']).toBe('Since 2026');
    expect(presetLabels('2026-12-31')['this-year-and-last-1']).toBe('Since 2025');
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
    // Last 12 months reaches into 13 calendar months.
    expect(periodGrain('2025-11-23', today)).toBe('month');
    expect(periodGrain('2025-10-31', today)).toBe('quarter');
    expect(periodGrain('2024-12-01', today)).toBe('quarter');
    expect(periodGrain('2024-11-30', today)).toBe('year');
  });
});

describe('the Period in the URL', () => {
  it('reads `period` as its preset, and a missing or unknown one as Last 12 months', () => {
    expect(periodFromParams({ period: 'rolling-90-days' })).toEqual(preset('rolling-90-days'));
    expect(periodFromParams({ period: ['year-to-date', 'rolling-30-days'] })).toEqual(
      preset('year-to-date'),
    );
    for (const params of [{}, { period: 'rolling-7-days' }, { period: '' }]) {
      expect(periodFromParams(params)).toEqual(preset('rolling-12-months'));
    }
  });

  it('reads `from` as nothing: a start date is no longer typed in', () => {
    // The page's whole search parameters, as it passes them.
    const read = (params: Record<string, string>) => periodFromParams(params);
    for (const from of ['2024-03-01', '2026-11-22', '2030-01-01', '']) {
      expect(read({ from })).toEqual(preset('rolling-12-months'));
    }
    expect(read({ period: 'year-to-date', from: '2024-03-01' })).toEqual(preset('year-to-date'));
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

  it('maps a former custom start date `from` to the default, unless a preset is sent beside it', () => {
    expect(legacyPeriod({ from: '2024-03-01' })).toEqual(preset('rolling-12-months'));
    expect(legacyPeriod({ from: '2024-03-01', period: 'custom' })).toEqual(
      preset('rolling-12-months'),
    );
    expect(legacyPeriod({ from: '2024-03-01', span: 'year-to-date' })).toEqual(
      preset('year-to-date'),
    );
    expect(legacyPeriod({ from: '2024-03-01', period: 'year-to-date' })).toBeNull();
  });

  it('links Analytics with a preset by its slug, and a custom Period by its start date', () => {
    expect(analyticsHref(unpinnedPage(preset('quarter-to-date')))).toBe(
      '/analytics?period=quarter-to-date',
    );
    expect(analyticsHref(unpinnedPage(custom('2024-03-01')))).toBe('/analytics?from=2024-03-01');
  });
});

describe('the Card Periods in the URL', () => {
  /** A URL's search parameters as the page reads them. */
  const paramsOf = (href: string) =>
    Object.fromEntries(new URL(href, 'http://localhost').searchParams);

  it('reserves one parameter per pinnable section, named after it', () => {
    expect(PINNABLE_SECTIONS).toEqual([
      'net-worth',
      'income-vs-expense',
      'spending-by-category',
      'profit-and-loss',
      'net-cash-flow',
      'profit-per-interval',
      'categories-per-interval',
    ]);
  });

  it('pins Income vs. expense under income-vs-expense, apart from Profit per interval', () => {
    expect(
      cardPeriodsFromParams({
        'income-vs-expense': 'year-to-date',
        'profit-per-interval': 'rolling-90-days',
      }),
    ).toEqual({ 'income-vs-expense': 'year-to-date', 'profit-per-interval': 'rolling-90-days' });
  });

  it('round-trips the page Period and its pins through an Analytics link', () => {
    const pins = {
      'spending-by-category': 'this-year-and-last-2',
      'net-worth': 'year-to-date',
    } as const;
    const href = analyticsHref({ period: preset('rolling-90-days'), cardPeriods: pins });

    expect(href).toBe(
      '/analytics?period=rolling-90-days&net-worth=year-to-date&spending-by-category=this-year-and-last-2',
    );
    const params = paramsOf(href);
    expect(periodFromParams(params)).toEqual(preset('rolling-90-days'));
    expect(cardPeriodsFromParams(params)).toEqual(pins);
  });

  it('keeps a pin equal to the page Period: a pick is a pin', () => {
    const href = analyticsHref({
      period: preset('year-to-date'),
      cardPeriods: { 'spending-by-category': 'year-to-date' },
    });

    expect(cardPeriodsFromParams(paramsOf(href))).toEqual({
      'spending-by-category': 'year-to-date',
    });
  });

  it('has no pins on a bare visit', () => {
    expect(cardPeriodsFromParams({})).toEqual({});
    expect(analyticsHref({ period: preset('rolling-12-months'), cardPeriods: {} })).toBe(
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
      'Last 90 days · 25 Aug – 22 Nov 2026',
    );
    expect(
      periodPhrase(preset('rolling-12-months'), { from: '2025-11-23', to: '2026-11-22' }),
    ).toBe('Last 12 months · 23 Nov 2025 – 22 Nov 2026');
    expect(
      periodPhrase(preset('this-year-and-last-1'), { from: '2025-01-01', to: '2026-11-22' }),
    ).toBe('Since 2025 · 1 Jan 2025 – 22 Nov 2026');
    expect(
      periodPhrase(
        { kind: 'custom', from: '2026-11-22' },
        { from: '2026-11-22', to: '2026-11-22' },
      ),
    ).toBe('Custom · 22 Nov 2026');
  });
});
