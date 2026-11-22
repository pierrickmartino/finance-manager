import { MONTH_NAMES } from '@/lib/format';
import { addDays } from '@/server/services/fx/dates';
import { periodOf, type DateSpan } from '@/server/services/reporting/periods';
import type { TimeAxis } from '@/server/services/reporting/query';

/**
 * The Span Analytics is read over (GLOSSARY: Span, Span preset; ADR-0016): a start date, chosen
 * by a Span preset or typed in, and today as its end, always. Pure, so the page, its links and
 * the Analytics service share it.
 */

export const SPAN_PRESETS = [
  'rolling-30-days',
  'rolling-60-days',
  'rolling-90-days',
  'quarter-to-date',
  'year-to-date',
  'rolling-12-months',
  'this-year-and-last-1',
  'this-year-and-last-2',
  'this-year-and-last-3',
  'this-year-and-last-4',
] as const;
export type SpanPreset = (typeof SPAN_PRESETS)[number];

export const SPAN_PRESET_LABELS: Record<SpanPreset, string> = {
  'rolling-30-days': 'Rolling 30 days',
  'rolling-60-days': 'Rolling 60 days',
  'rolling-90-days': 'Rolling 90 days',
  'quarter-to-date': 'Quarter to date',
  'year-to-date': 'Year to date',
  'rolling-12-months': 'Rolling 12 months',
  'this-year-and-last-1': 'This year and last 1',
  'this-year-and-last-2': 'This year and last 2',
  'this-year-and-last-3': 'This year and last 3',
  'this-year-and-last-4': 'This year and last 4',
};

export function isSpanPreset(value: unknown): value is SpanPreset {
  return (SPAN_PRESETS as readonly unknown[]).includes(value);
}

/** How a Span was chosen: a preset moves with today, a custom start date stays put. */
export type Span = { kind: 'preset'; preset: SpanPreset } | { kind: 'custom'; from: string };

/** The Span a preset chooses. */
export const presetSpan = (preset: SpanPreset): Span => ({ kind: 'preset', preset });

/** The start date a preset gives on `today`. */
function presetStart(preset: SpanPreset, today: string): string {
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case 'rolling-30-days':
      return addDays(today, -29);
    case 'rolling-60-days':
      return addDays(today, -59);
    case 'rolling-90-days':
      return addDays(today, -89);
    case 'quarter-to-date':
      return periodOf(today, 'quarter').from;
    case 'year-to-date':
      return `${year}-01-01`;
    case 'rolling-12-months': {
      // The same date a year earlier (29 February falls back to the 28th), then the day after.
      const monthDay = today.slice(5) === '02-29' ? '02-28' : today.slice(5);
      return addDays(`${String(year - 1).padStart(4, '0')}-${monthDay}`, 1);
    }
    case 'this-year-and-last-1':
      return `${year - 1}-01-01`;
    case 'this-year-and-last-2':
      return `${year - 2}-01-01`;
    case 'this-year-and-last-3':
      return `${year - 3}-01-01`;
    case 'this-year-and-last-4':
      return `${year - 4}-01-01`;
  }
}

/** The first day a Span reads on `today`. */
export function spanStart(span: Span, today: string): string {
  return span.kind === 'custom' ? span.from : presetStart(span.preset, today);
}

/** Each preset's start date on `today`: what the control fills in when one is picked. */
export function presetStarts(today: string): Record<SpanPreset, string> {
  return Object.fromEntries(
    SPAN_PRESETS.map((preset) => [preset, presetStart(preset, today)]),
  ) as Record<SpanPreset, string>;
}

/** The longest Spans read by month, then by quarter, in calendar months reached. */
const MAX_MONTHLY_MONTHS = 13;
const MAX_QUARTERLY_MONTHS = 24;

/** How many calendar months a stretch of days reaches into, both ends included. */
function monthsReached(from: string, to: string): number {
  const index = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));
  return index(to) - index(from) + 1;
}

/** The grain a Span from `from` to `to` is split by: it follows from its length. */
export function spanGrain(from: string, to: string): TimeAxis {
  const months = monthsReached(from, to);
  if (months <= MAX_MONTHLY_MONTHS) return 'month';
  return months <= MAX_QUARTERLY_MONTHS ? 'quarter' : 'year';
}

/** The Span Analytics opens on: Rolling 12 months, as the former Month view read. */
export const DEFAULT_SPAN: Span = presetSpan('rolling-12-months');

/** The search parameters a Span is read from. */
export interface SpanParams {
  span?: string | string[];
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The Span in Analytics' URL: `span=<slug>`; otherwise, or for an unknown slug, the default. */
export function spanFromParams(params: SpanParams): Span {
  const slug = first(params.span);
  return isSpanPreset(slug) ? presetSpan(slug) : DEFAULT_SPAN;
}

/** The nearest preset of each former Period view (`?period=`), which the page redirects to. */
const LEGACY_PRESETS: ReadonlyMap<string | undefined, SpanPreset> = new Map([
  ['month', 'rolling-12-months'],
  ['quarter', 'this-year-and-last-1'],
  ['year', 'this-year-and-last-4'],
]);

/** The Span a legacy `period` value stands for; none for a missing or unknown one. */
export function legacySpan(period: string | string[] | undefined): Span | null {
  const preset = LEGACY_PRESETS.get(first(period));
  return preset === undefined ? null : presetSpan(preset);
}

/** A Span as search parameters: `span` for a preset, `from` for a custom start date. */
export function spanToParams(span: Span): URLSearchParams {
  return new URLSearchParams(span.kind === 'preset' ? { span: span.preset } : { from: span.from });
}

/** Analytics read over a Span. */
export function analyticsHref(span: Span): string {
  return `/analytics?${spanToParams(span)}`;
}

/** How a Span was chosen, in words: its preset's name, or Custom. */
export function spanLabel(span: Span): string {
  return span.kind === 'preset' ? SPAN_PRESET_LABELS[span.preset] : 'Custom';
}

/** A day in words: "25 Aug", with its year when asked. */
function dayInWords(iso: string, withYear: boolean): string {
  const day = `${Number(iso.slice(8, 10))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]}`;
  return withYear ? `${day} ${iso.slice(0, 4)}` : day;
}

/** A Span's dates in words: "25 Aug – 22 Nov 2026", the first year only when it differs. */
export function spanDates({ from, to }: DateSpan): string {
  if (from === to) return dayInWords(to, true);
  return `${dayInWords(from, from.slice(0, 4) !== to.slice(0, 4))} – ${dayInWords(to, true)}`;
}

/** The Span as the control names it: "Rolling 90 days · 25 Aug – 22 Nov 2026". */
export function spanPhrase(span: Span, dates: DateSpan): string {
  return `${spanLabel(span)} · ${spanDates(dates)}`;
}
