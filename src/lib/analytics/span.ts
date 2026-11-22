import { addDays, dateParts, isoDate, monthIndex, monthStart, yearsEarlier } from '@/lib/dates';
import { MONTH_NAMES } from '@/lib/format';
import type { DateSpan } from '@/server/services/reporting/periods';
import type { TimeAxis } from '@/server/services/reporting/query';

/**
 * The Span Analytics is read over (GLOSSARY: Span, Span preset; ADR-0016): a start date, chosen
 * by a Span preset or typed in, and today as its end, always. Pure, so the page, its links and
 * the Analytics service share it.
 */

/** What a Span preset is compared with (GLOSSARY: Comparison span). */
export type PresetComparison =
  /** As many days just before the Span. */
  | { kind: 'daysBefore' }
  /** The same stretch of the previous calendar quarter. */
  | { kind: 'previousQuarterToDate' }
  /** The same dates as many calendar years earlier as the Span reads. */
  | { kind: 'yearsEarlier'; years: number };

/** One Span preset: its name, the start date it gives on `today`, what it is compared with. */
interface PresetRule {
  label: string;
  start: (today: string) => string;
  comparison: PresetComparison;
}

const MONTHS_PER_QUARTER = 3;
const DAYS_BEFORE: PresetComparison = { kind: 'daysBefore' };

/** The `days` days up to today. */
const rollingDays = (days: number, label: string): PresetRule => ({
  label,
  start: (today) => addDays(today, 1 - days),
  comparison: DAYS_BEFORE,
});

/** This calendar year to date and the `last` whole ones before it. */
const yearsToDate = (last: number, label: string): PresetRule => ({
  label,
  start: (today) => isoDate({ year: dateParts(today).year - last, month: 1, day: 1 }),
  comparison: { kind: 'yearsEarlier', years: last + 1 },
});

/**
 * Every Span preset, in the control's order: adding one is an entry here, and the compiler
 * asks for nothing else.
 */
const PRESET_RULES = {
  'rolling-30-days': rollingDays(30, 'Rolling 30 days'),
  'rolling-60-days': rollingDays(60, 'Rolling 60 days'),
  'rolling-90-days': rollingDays(90, 'Rolling 90 days'),
  'quarter-to-date': {
    label: 'Quarter to date',
    start: (today) => {
      const month = monthIndex(today);
      return monthStart(month - (month % MONTHS_PER_QUARTER));
    },
    comparison: { kind: 'previousQuarterToDate' },
  },
  'year-to-date': yearsToDate(0, 'Year to date'),
  'rolling-12-months': {
    label: 'Rolling 12 months',
    // The same date a year earlier (29 February falls back to the 28th), then the day after.
    start: (today) => addDays(yearsEarlier(today, 1), 1),
    comparison: DAYS_BEFORE,
  },
  'this-year-and-last-1': yearsToDate(1, 'This year and last 1'),
  'this-year-and-last-2': yearsToDate(2, 'This year and last 2'),
  'this-year-and-last-3': yearsToDate(3, 'This year and last 3'),
  'this-year-and-last-4': yearsToDate(4, 'This year and last 4'),
} as const satisfies Record<string, PresetRule>;

export type SpanPreset = keyof typeof PRESET_RULES;

export const SPAN_PRESETS = Object.keys(PRESET_RULES) as readonly SpanPreset[];

export const SPAN_PRESET_LABELS = Object.fromEntries(
  SPAN_PRESETS.map((preset) => [preset, PRESET_RULES[preset].label]),
) as Record<SpanPreset, string>;

export function isSpanPreset(value: unknown): value is SpanPreset {
  return (SPAN_PRESETS as readonly unknown[]).includes(value);
}

/** What a preset's Span is compared with, when read from the start the preset gives. */
export const presetComparison = (preset: SpanPreset): PresetComparison =>
  PRESET_RULES[preset].comparison;

/** How a Span was chosen: a preset moves with today, a custom start date stays put. */
export type Span = { kind: 'preset'; preset: SpanPreset } | { kind: 'custom'; from: string };

/** The Span a preset chooses. */
export const presetSpan = (preset: SpanPreset): Span => ({ kind: 'preset', preset });

/** The start date a preset gives on `today`. */
const presetStart = (preset: SpanPreset, today: string): string =>
  PRESET_RULES[preset].start(today);

/** The first day a Span gives on `today`, as chosen: its preset's start, or the typed date. */
export function spanStart(span: Span, today: string): string {
  return span.kind === 'custom' ? span.from : presetStart(span.preset, today);
}

/**
 * A start date cut to the data: moved up to the first Transaction's date (`dataStart`, null when
 * there is none) when earlier, so no empty periods come before the data, but never past today,
 * since a Span always ends today.
 */
function clampedStart(start: string, dataStart: string | null, today: string): string {
  if (dataStart === null) return start;
  const earliest = dataStart > today ? today : dataStart;
  return start < earliest ? earliest : start;
}

/** The first day a Span is read from on `today`: its start, cut to the data (`clampedStart`). */
export function readStart(span: Span, today: string, dataStart: string | null): string {
  return clampedStart(spanStart(span, today), dataStart, today);
}

/**
 * Each preset's start date on `today`, cut to the data as it is read (`clampedStart`): what the
 * control fills in when one is picked.
 */
export function presetStarts(
  today: string,
  dataStart: string | null = null,
): Record<SpanPreset, string> {
  return Object.fromEntries(
    SPAN_PRESETS.map((preset) => [
      preset,
      clampedStart(presetStart(preset, today), dataStart, today),
    ]),
  ) as Record<SpanPreset, string>;
}

/** The longest Spans read by month, then by quarter, in calendar months reached. */
const MAX_MONTHLY_MONTHS = 13;
const MAX_QUARTERLY_MONTHS = 24;

/** How many calendar months a stretch of days reaches into, both ends included. */
const monthsReached = (from: string, to: string): number => monthIndex(to) - monthIndex(from) + 1;

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
  from?: string | string[];
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Whether a value is a real calendar day as `YYYY-MM-DD`. */
function isIsoDay(value: string | undefined): value is string {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/**
 * The Span in Analytics' URL on `today`: `span=<slug>` gives that preset (so a chosen preset wins
 * over the date sent beside it); otherwise `from=YYYY-MM-DD`, on or before today, gives a custom
 * Span. Anything else is the default.
 */
export function spanFromParams(params: SpanParams, today: string): Span {
  const slug = first(params.span);
  if (isSpanPreset(slug)) return presetSpan(slug);
  const from = first(params.from);
  return isIsoDay(from) && from <= today ? { kind: 'custom', from } : DEFAULT_SPAN;
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

/**
 * What a figure over a Span read over `dates` is captioned with: its preset's name ("Rolling 90
 * days"), or its start date to today ("1 Jan 2024 – today") for a custom Span, or a preset read
 * from a later start than it gives (cut to the data).
 */
export function spanCaption(span: Span, { from, to }: DateSpan): string {
  return span.kind === 'preset' && spanStart(span, to) === from
    ? SPAN_PRESET_LABELS[span.preset]
    : `${dayInWords(from, true)} – today`;
}

/** A day in words: "25 Aug", with its year when asked. */
function dayInWords(iso: string, withYear: boolean): string {
  const { year, month, day } = dateParts(iso);
  const words = `${day} ${MONTH_NAMES[month - 1]}`;
  return withYear ? `${words} ${year}` : words;
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
