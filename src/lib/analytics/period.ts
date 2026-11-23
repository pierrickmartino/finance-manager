import { addDays, dateParts, isoDate, monthIndex, monthStart, yearsEarlier } from '@/lib/dates';
import { MONTH_NAMES } from '@/lib/format';
import type { DateSpan } from '@/server/services/reporting/periods';
import type { TimeAxis } from '@/server/services/reporting/query';

/**
 * The Period Analytics is read over (GLOSSARY: Period, Period preset; ADR-0016): a start date, chosen
 * by a Period preset or typed in, and today as its end, always. Pure, so the page, its links and
 * the Analytics service share it.
 */

/** What a Period preset is compared with (GLOSSARY: Comparison period). */
export type PresetComparison =
  /** As many days just before the Period. */
  | { kind: 'daysBefore' }
  /** The same stretch of the previous calendar quarter. */
  | { kind: 'previousQuarterToDate' }
  /** The same dates as many calendar years earlier as the Period reads. */
  | { kind: 'yearsEarlier'; years: number };

/** One Period preset: its name, the start date it gives on `today`, what it is compared with. */
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
 * Every Period preset, in the control's order: adding one is an entry here, and the compiler
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

export type PeriodPreset = keyof typeof PRESET_RULES;

export const PERIOD_PRESETS = Object.keys(PRESET_RULES) as readonly PeriodPreset[];

export const PERIOD_PRESET_LABELS = Object.fromEntries(
  PERIOD_PRESETS.map((preset) => [preset, PRESET_RULES[preset].label]),
) as Record<PeriodPreset, string>;

export function isPeriodPreset(value: unknown): value is PeriodPreset {
  return (PERIOD_PRESETS as readonly unknown[]).includes(value);
}

/** What a preset's Period is compared with, when read from the start the preset gives. */
export const presetComparison = (preset: PeriodPreset): PresetComparison =>
  PRESET_RULES[preset].comparison;

/** How a Period was chosen: a preset moves with today, a custom start date stays put. */
export type Period = { kind: 'preset'; preset: PeriodPreset } | { kind: 'custom'; from: string };

/** The Period a preset chooses. */
export const presetPeriod = (preset: PeriodPreset): Period => ({ kind: 'preset', preset });

/** The start date a preset gives on `today`. */
const presetStart = (preset: PeriodPreset, today: string): string =>
  PRESET_RULES[preset].start(today);

/** The first day a Period gives on `today`, as chosen: its preset's start, or the typed date. */
export function periodStart(period: Period, today: string): string {
  return period.kind === 'custom' ? period.from : presetStart(period.preset, today);
}

/**
 * A start date cut to the data: moved up to the first Transaction's date (`dataStart`, null when
 * there is none) when earlier, so no empty intervals come before the data, but never past today,
 * since a Period always ends today.
 */
function clampedStart(start: string, dataStart: string | null, today: string): string {
  if (dataStart === null) return start;
  const earliest = dataStart > today ? today : dataStart;
  return start < earliest ? earliest : start;
}

/** The first day a Period is read from on `today`: its start, cut to the data (`clampedStart`). */
export function readStart(period: Period, today: string, dataStart: string | null): string {
  return clampedStart(periodStart(period, today), dataStart, today);
}

/**
 * Each preset's start date on `today`, cut to the data as it is read (`clampedStart`): what the
 * control fills in when one is picked.
 */
export function presetStarts(
  today: string,
  dataStart: string | null = null,
): Record<PeriodPreset, string> {
  return Object.fromEntries(
    PERIOD_PRESETS.map((preset) => [
      preset,
      clampedStart(presetStart(preset, today), dataStart, today),
    ]),
  ) as Record<PeriodPreset, string>;
}

/** The longest Periods read by month, then by quarter, in calendar months reached. */
const MAX_MONTHLY_MONTHS = 13;
const MAX_QUARTERLY_MONTHS = 24;

/** How many calendar months a stretch of days reaches into, both ends included. */
const monthsReached = (from: string, to: string): number => monthIndex(to) - monthIndex(from) + 1;

/** The grain a Period from `from` to `to` is split by: it follows from its length. */
export function periodGrain(from: string, to: string): TimeAxis {
  const months = monthsReached(from, to);
  if (months <= MAX_MONTHLY_MONTHS) return 'month';
  return months <= MAX_QUARTERLY_MONTHS ? 'quarter' : 'year';
}

/** The Period Analytics opens on: Rolling 12 months, as the former Month view read. */
export const DEFAULT_PERIOD: Period = presetPeriod('rolling-12-months');

/** The search parameters a Period is read from. */
export interface PeriodParams {
  period?: string | string[];
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
 * The Period in Analytics' URL on `today`: `period=<slug>` gives that preset (so a chosen preset wins
 * over the date sent beside it); otherwise `from=YYYY-MM-DD`, on or before today, gives a custom
 * Period. Anything else is the default.
 */
export function periodFromParams(params: PeriodParams, today: string): Period {
  const slug = first(params.period);
  if (isPeriodPreset(slug)) return presetPeriod(slug);
  const from = first(params.from);
  return isIsoDay(from) && from <= today ? { kind: 'custom', from } : DEFAULT_PERIOD;
}

/** The nearest preset of each former Period view (`?period=month`), which the page redirects to. */
const LEGACY_PRESETS: ReadonlyMap<string | undefined, PeriodPreset> = new Map([
  ['month', 'rolling-12-months'],
  ['quarter', 'this-year-and-last-1'],
  ['year', 'this-year-and-last-4'],
]);

/** The search parameters of a former link: a Period view's `period`, or a Span's `span`. */
export interface LegacyPeriodParams {
  period?: string | string[];
  span?: string | string[];
}

/**
 * The Period a former link stands for, which the page redirects to: a former Period view's
 * nearest preset (`?period=month`), or the preset a former Span named (`?span=<slug>`, when no
 * preset `period` is sent beside it). None for a current link, or a missing or unknown value.
 */
export function legacyPeriod({ period, span }: LegacyPeriodParams): Period | null {
  const value = first(period);
  if (isPeriodPreset(value)) return null;
  const preset = LEGACY_PRESETS.get(value);
  if (preset !== undefined) return presetPeriod(preset);
  const slug = first(span);
  return isPeriodPreset(slug) ? presetPeriod(slug) : null;
}

/** A Period as search parameters: `period` for a preset, `from` for a custom start date. */
export function periodToParams(period: Period): URLSearchParams {
  return new URLSearchParams(
    period.kind === 'preset' ? { period: period.preset } : { from: period.from },
  );
}

/** Analytics read over a Period. */
export function analyticsHref(period: Period): string {
  return `/analytics?${periodToParams(period)}`;
}

/** How a Period was chosen, in words: its preset's name, or Custom. */
export function periodLabel(period: Period): string {
  return period.kind === 'preset' ? PERIOD_PRESET_LABELS[period.preset] : 'Custom';
}

/**
 * What a figure over a Period read over `dates` is captioned with: its preset's name ("Rolling 90
 * days"), or its start date to today ("1 Jan 2024 – today") for a custom Period, or a preset read
 * from a later start than it gives (cut to the data).
 */
export function periodCaption(period: Period, { from, to }: DateSpan): string {
  return period.kind === 'preset' && periodStart(period, to) === from
    ? PERIOD_PRESET_LABELS[period.preset]
    : `${dayInWords(from, true)} – today`;
}

/** A day in words: "25 Aug", with its year when asked. */
function dayInWords(iso: string, withYear: boolean): string {
  const { year, month, day } = dateParts(iso);
  const words = `${day} ${MONTH_NAMES[month - 1]}`;
  return withYear ? `${words} ${year}` : words;
}

/** A Period's dates in words: "25 Aug – 22 Nov 2026", the first year only when it differs. */
export function periodDates({ from, to }: DateSpan): string {
  if (from === to) return dayInWords(to, true);
  return `${dayInWords(from, from.slice(0, 4) !== to.slice(0, 4))} – ${dayInWords(to, true)}`;
}

/** The Period as the control names it: "Rolling 90 days · 25 Aug – 22 Nov 2026". */
export function periodPhrase(period: Period, dates: DateSpan): string {
  return `${periodLabel(period)} · ${periodDates(dates)}`;
}
