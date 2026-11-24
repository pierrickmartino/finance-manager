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

/**
 * One Period preset: its name on `today`, the start date it gives on `today`, what it is compared
 * with.
 */
interface PresetRule {
  label: (today: string) => string;
  start: (today: string) => string;
  comparison: PresetComparison;
}

const MONTHS_PER_QUARTER = 3;
const DAYS_BEFORE: PresetComparison = { kind: 'daysBefore' };

/** The `days` days up to today: "Last 30 days". */
const rollingDays = (days: number): PresetRule => ({
  label: () => `Last ${days} days`,
  start: (today) => addDays(today, 1 - days),
  comparison: DAYS_BEFORE,
});

/** The year this calendar year to date and the `last` whole ones before it start in. */
const firstYear = (today: string, last: number): number => dateParts(today).year - last;

/**
 * This calendar year to date and the `last` whole ones before it: "Year to date" alone, else named
 * by the year it starts in ("Since 2025"), which moves on each New Year as its start does.
 */
const yearsToDate = (last: number): PresetRule => ({
  label: (today) => (last === 0 ? 'Year to date' : `Since ${firstYear(today, last)}`),
  start: (today) => isoDate({ year: firstYear(today, last), month: 1, day: 1 }),
  comparison: { kind: 'yearsEarlier', years: last + 1 },
});

/**
 * Every Period preset, in the control's order: adding one is an entry here, and the compiler
 * asks for nothing else.
 */
const PRESET_RULES = {
  'rolling-30-days': rollingDays(30),
  'rolling-60-days': rollingDays(60),
  'rolling-90-days': rollingDays(90),
  'quarter-to-date': {
    label: () => 'Quarter to date',
    start: (today) => {
      const month = monthIndex(today);
      return monthStart(month - (month % MONTHS_PER_QUARTER));
    },
    comparison: { kind: 'previousQuarterToDate' },
  },
  'year-to-date': yearsToDate(0),
  'rolling-12-months': {
    label: () => 'Last 12 months',
    // The same date a year earlier (29 February falls back to the 28th), then the day after.
    start: (today) => addDays(yearsEarlier(today, 1), 1),
    comparison: DAYS_BEFORE,
  },
  'this-year-and-last-1': yearsToDate(1),
  'this-year-and-last-2': yearsToDate(2),
  'this-year-and-last-3': yearsToDate(3),
  'this-year-and-last-4': yearsToDate(4),
} as const satisfies Record<string, PresetRule>;

export type PeriodPreset = keyof typeof PRESET_RULES;

export const PERIOD_PRESETS = Object.keys(PRESET_RULES) as readonly PeriodPreset[];

/**
 * A preset's name on `today` ("Last 90 days", "Since 2025"). Its slug never changes, so links and
 * pins outlive a name that moves on with the year.
 */
export const presetLabel = (preset: PeriodPreset, today: string): string =>
  PRESET_RULES[preset].label(today);

/** Every preset's name on `today`, for a control that lists them. */
export function presetLabels(today: string): Record<PeriodPreset, string> {
  return Object.fromEntries(
    PERIOD_PRESETS.map((preset) => [preset, presetLabel(preset, today)]),
  ) as Record<PeriodPreset, string>;
}

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

/** The Period Analytics opens on: Last 12 months, as the former Month view read. */
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

/**
 * The sections of Analytics that can be pinned to their own Card Period (GLOSSARY: Card Period,
 * ADR-0018), in the page's order, each by the search parameter its pin travels in. The Key
 * figures, the spending insight, the most recent Transactions and the Account balances have none.
 */
export const PINNABLE_SECTIONS = [
  'net-worth',
  'income-vs-expense',
  'spending-by-category',
  'profit-and-loss',
  'net-cash-flow',
  'profit-per-interval',
  'categories-per-interval',
] as const;

export type PinnableSection = (typeof PINNABLE_SECTIONS)[number];

/** The Card Periods: each pinned section's Period preset. An unpinned section has no entry. */
export type CardPeriods = Partial<Readonly<Record<PinnableSection, PeriodPreset>>>;

/** Analytics as its URL reads it: the page's Period and its Cards' pins. */
export interface AnalyticsPage {
  period: Period;
  cardPeriods: CardPeriods;
}

/** No pins: every Card follows the page's Period, as on a bare visit. */
export const NO_PINS: CardPeriods = {};

/** The search parameters the Card Periods are read from: one per pinnable section. */
export type CardPeriodParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * The Card Periods in Analytics' URL: `<section>=<slug>` pins that section to that preset. Any
 * other parameter, a section that can't be pinned, or a value that is no Period preset is dropped.
 */
export function cardPeriodsFromParams(params: CardPeriodParams): CardPeriods {
  return Object.fromEntries(
    PINNABLE_SECTIONS.flatMap((section) => {
      const slug = first(params[section]);
      return isPeriodPreset(slug) ? [[section, slug] as const] : [];
    }),
  );
}

/** The Card Periods with one section pinned to `preset`, or unpinned ("Same as page") for null. */
export function withCardPeriod(
  pins: CardPeriods,
  section: PinnableSection,
  preset: PeriodPreset | null,
): CardPeriods {
  const { [section]: _dropped, ...others } = pins;
  return preset === null ? others : { ...others, [section]: preset };
}

/** The Card Periods as search parameters: each pin by its section, in the page's order. */
export function cardPeriodsToParams(pins: CardPeriods): URLSearchParams {
  return new URLSearchParams(
    PINNABLE_SECTIONS.flatMap((section) => {
      const preset = pins[section];
      return preset === undefined ? [] : [[section, preset]];
    }),
  );
}

/**
 * Analytics' page as search parameters, `period` for a preset, `from` for a custom start date,
 * then each pin by its section (`cardPeriodsToParams`). Nothing is dropped: a pin equal to the
 * Period stays.
 */
export function periodToParams({ period, cardPeriods }: AnalyticsPage): URLSearchParams {
  return new URLSearchParams([
    period.kind === 'preset' ? ['period', period.preset] : ['from', period.from],
    ...cardPeriodsToParams(cardPeriods),
  ]);
}

/** Analytics read over a Period, with its Cards' pins. */
export function analyticsHref(page: AnalyticsPage): string {
  return `/analytics?${periodToParams(page)}`;
}

/** Analytics over a Period, no Card pinned: what a bare visit or a former link reads. */
export const unpinnedPage = (period: Period): AnalyticsPage => ({ period, cardPeriods: NO_PINS });

/**
 * A preset's name at the end of a sentence ("no expense …"): "in the last 30 days", "in the
 * quarter to date", "since 2025".
 */
export function presetNameInSentence(name: string): string {
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  return lower.startsWith('since ') ? lower : `in the ${lower}`;
}

/** How a Period was chosen, in words on `today`: its preset's name, or Custom. */
export function periodLabel(period: Period, today: string): string {
  return period.kind === 'preset' ? presetLabel(period.preset, today) : 'Custom';
}

/**
 * What a figure over a Period read over `dates` is captioned with: its preset's name ("Last 90
 * days"), or its start date to today ("1 Jan 2024 – today") for a custom Period, or a preset read
 * from a later start than it gives (cut to the data).
 */
export function periodCaption(period: Period, { from, to }: DateSpan): string {
  return period.kind === 'preset' && periodStart(period, to) === from
    ? presetLabel(period.preset, to)
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

/** The Period as the control names it: "Last 90 days · 25 Aug – 22 Nov 2026". */
export function periodPhrase(period: Period, dates: DateSpan): string {
  return `${periodLabel(period, dates.to)} · ${periodDates(dates)}`;
}
