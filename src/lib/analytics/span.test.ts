import { describe, expect, it } from 'vitest';
import {
  analyticsHref,
  legacySpan,
  presetSpan,
  presetStarts,
  spanCaption,
  spanFromParams,
  spanGrain,
  spanPhrase,
  spanStart,
  type Span,
} from './span';

/** The Span model (GLOSSARY: Span, Span preset; ADR-0016), read on a fixed today. */

const preset = presetSpan;
const custom = (from: string): Span => ({ kind: 'custom', from });

describe('a Span preset', () => {
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
    expect(spanStart(preset('rolling-12-months'), '2024-02-29')).toBe('2023-03-01');
    expect(spanStart(preset('rolling-12-months'), '2026-01-01')).toBe('2025-01-02');
    expect(spanStart(preset('quarter-to-date'), '2026-03-31')).toBe('2026-01-01');
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

describe("a Span's caption", () => {
  const dates = { from: '2026-01-01', to: '2026-11-22' };

  it("is its preset's name when read from the start it gives", () => {
    expect(spanCaption(preset('year-to-date'), dates)).toBe('Year to date');
  });

  it('is its start date to today for a custom Span, or a preset cut to the data', () => {
    expect(spanCaption(custom('2026-01-01'), dates)).toBe('1 Jan 2026 – today');
    expect(spanCaption(preset('this-year-and-last-1'), dates)).toBe('1 Jan 2026 – today');
  });
});

describe("a Span's grain", () => {
  it('is months up to 13 calendar months, quarters up to 24, years beyond', () => {
    const today = '2026-11-22';

    expect(spanGrain('2026-11-01', today)).toBe('month');
    // Rolling 12 months reaches into 13 calendar months.
    expect(spanGrain('2025-11-23', today)).toBe('month');
    expect(spanGrain('2025-10-31', today)).toBe('quarter');
    expect(spanGrain('2024-12-01', today)).toBe('quarter');
    expect(spanGrain('2024-11-30', today)).toBe('year');
  });
});

describe('the Span in the URL', () => {
  it('reads `span` as its preset, and a missing or unknown one as Rolling 12 months', () => {
    expect(spanFromParams({ span: 'rolling-90-days' }, '2026-11-22')).toEqual(
      preset('rolling-90-days'),
    );
    expect(spanFromParams({ span: ['year-to-date', 'rolling-30-days'] }, '2026-11-22')).toEqual(
      preset('year-to-date'),
    );
    for (const params of [{}, { span: 'rolling-7-days' }, { span: '' }]) {
      expect(spanFromParams(params, '2026-11-22')).toEqual(preset('rolling-12-months'));
    }
  });

  it('reads a valid `from` on or before today as a custom Span', () => {
    const today = '2026-11-22';
    expect(spanFromParams({ from: '2024-03-01' }, today)).toEqual(custom('2024-03-01'));
    expect(spanFromParams({ from: '2026-11-22' }, today)).toEqual(custom('2026-11-22'));
    expect(spanFromParams({ from: ['2025-01-31', '2020-01-01'] }, today)).toEqual(
      custom('2025-01-31'),
    );
  });

  it('keeps a custom start date on a later day, where a preset rolls forward', () => {
    for (const today of ['2026-11-22', '2027-05-03']) {
      expect(spanStart(spanFromParams({ from: '2024-03-01' }, today), today)).toBe('2024-03-01');
    }
    expect(spanStart(spanFromParams({ span: 'rolling-30-days' }, '2027-05-03'), '2027-05-03')).toBe(
      '2027-04-04',
    );
  });

  it('reads a future or malformed `from` as Rolling 12 months', () => {
    const today = '2026-11-22';
    for (const from of ['2026-11-23', '2030-01-01', '2026-02-30', '2026-13-01', '1-3-2024', '']) {
      expect(spanFromParams({ from }, today)).toEqual(preset('rolling-12-months'));
    }
  });

  it('lets a chosen preset win over `from`, and an unknown `span` (Custom) defer to it', () => {
    const today = '2026-11-22';
    expect(spanFromParams({ span: 'year-to-date', from: '2024-03-01' }, today)).toEqual(
      preset('year-to-date'),
    );
    expect(spanFromParams({ span: 'custom', from: '2024-03-01' }, today)).toEqual(
      custom('2024-03-01'),
    );
  });

  it('maps a legacy `period` to its nearest preset, and anything else to none', () => {
    expect(legacySpan('month')).toEqual(preset('rolling-12-months'));
    expect(legacySpan('quarter')).toEqual(preset('this-year-and-last-1'));
    expect(legacySpan('year')).toEqual(preset('this-year-and-last-4'));
    expect(legacySpan('week')).toBeNull();
    expect(legacySpan(undefined)).toBeNull();
  });

  it('links Analytics with a preset by its slug, and a custom Span by its start date', () => {
    expect(analyticsHref(preset('quarter-to-date'))).toBe('/analytics?span=quarter-to-date');
    expect(analyticsHref({ kind: 'custom', from: '2024-03-01' })).toBe(
      '/analytics?from=2024-03-01',
    );
  });
});

describe('the Span in words', () => {
  it('names the preset and its dates, the year once when both ends share it', () => {
    expect(spanPhrase(preset('rolling-90-days'), { from: '2026-08-25', to: '2026-11-22' })).toBe(
      'Rolling 90 days · 25 Aug – 22 Nov 2026',
    );
    expect(spanPhrase(preset('rolling-12-months'), { from: '2025-11-23', to: '2026-11-22' })).toBe(
      'Rolling 12 months · 23 Nov 2025 – 22 Nov 2026',
    );
    expect(
      spanPhrase({ kind: 'custom', from: '2026-11-22' }, { from: '2026-11-22', to: '2026-11-22' }),
    ).toBe('Custom · 22 Nov 2026');
  });
});
