import { z } from 'zod';
import { CATEGORY_GROUP_TYPES } from '../categories/model';

/**
 * The Widget query definition (spec 99–103): filters, a date range, up to two axes and a
 * measure. It is stored as JSON on a Widget and compiled into one SQL query by the engine.
 */

export const TIME_AXES = ['month', 'quarter', 'year'] as const;
export type TimeAxis = (typeof TIME_AXES)[number];

export const REPORT_AXES = [
  ...TIME_AXES,
  'categoryGroupType',
  'categoryGroup',
  'category',
  'account',
  'payee',
  'tag',
  'currency',
] as const;
export type ReportAxis = (typeof REPORT_AXES)[number];

export const AXIS_LABELS: Record<ReportAxis, string> = {
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  categoryGroupType: 'Category group type',
  categoryGroup: 'Category group',
  category: 'Category',
  account: 'Account',
  payee: 'Payee',
  tag: 'Tag',
  currency: 'Currency',
};

export function isTimeAxis(axis: ReportAxis | null | undefined): axis is TimeAxis {
  return (TIME_AXES as readonly string[]).includes(axis ?? '');
}

export const MEASURES = ['sum', 'count', 'average'] as const;
export type Measure = (typeof MEASURES)[number];

export const MEASURE_LABELS: Record<Measure, string> = {
  sum: 'Sum',
  count: 'Count',
  average: 'Average per period',
};

/** The longest live range, in periods. */
export const MAX_LIVE_PERIODS = 120;
/** The longest fixed range, in days (about 50 years). */
const MAX_FIXED_DAYS = 18_300;

const isoDate = (what: string) => z.iso.date({ error: `${what} must be a date (YYYY-MM-DD)` });
const ids = (what: string) => z.array(z.uuid({ error: `Unknown ${what}` })).max(500);

const fixedRange = z
  .object({ kind: z.literal('fixed'), from: isoDate('From'), to: isoDate('To') })
  .refine((range) => range.from <= range.to, 'From must not be after To')
  .refine(
    (range) => Date.parse(range.to) - Date.parse(range.from) <= MAX_FIXED_DAYS * 86_400_000,
    'The date range must be at most 50 years',
  );

/** The last N complete months, quarters or years; optionally followed by the current one. */
const lastPeriodsRange = z.object({
  kind: z.literal('last'),
  count: z
    .number()
    .int()
    .min(1, 'Show at least one period')
    .max(MAX_LIVE_PERIODS, `Show at most ${MAX_LIVE_PERIODS} periods`),
  unit: z.enum(TIME_AXES, { error: 'Period must be month, quarter or year' }),
  includeCurrent: z.boolean().default(false),
});

/** January to the last complete month of this year; optionally with the current month. */
const yearToDateRange = z.object({
  kind: z.literal('yearToDate'),
  includeCurrent: z.boolean().default(false),
});

export const dateRangeInput = z.discriminatedUnion(
  'kind',
  [fixedRange, lastPeriodsRange, yearToDateRange],
  { error: 'Choose a date range' },
);
export type DateRange = z.output<typeof dateRangeInput>;

const filtersInput = z
  .object({
    accountIds: ids('Account'),
    categoryGroupIds: ids('Category group'),
    categoryIds: ids('Category'),
    payeeIds: ids('Payee'),
    tagIds: ids('Tag'),
    categoryGroupTypes: z.array(
      z.enum(CATEGORY_GROUP_TYPES, {
        error: 'Category group type must be Income, Expense or Capital',
      }),
    ),
    currencies: z.array(z.string().regex(/^[A-Z]{3}$/, 'Currency must be an ISO code')).max(50),
  })
  .partial();
export type ReportFilters = z.output<typeof filtersInput>;

export const widgetQueryInput = z
  .object({
    filters: filtersInput.default({}),
    dateRange: dateRangeInput,
    rows: z.enum(REPORT_AXES, { error: 'Unknown row axis' }).nullable().default(null),
    columns: z.enum(REPORT_AXES, { error: 'Unknown column axis' }).nullable().default(null),
    measure: z.enum(MEASURES, { error: 'Measure must be sum, count or average' }).default('sum'),
    /** The period the `average` measure divides by. */
    averagePer: z.enum(TIME_AXES).default('month'),
    /**
     * Capital is left out of every report by default (spec 51, 110), so income and expense
     * figures show the day-to-day economy. Net cash flow sets this. Filtering on the Capital
     * Category group type includes it too.
     */
    includeCapital: z.boolean().default(false),
  })
  .refine(
    (query) => query.rows === null || query.rows !== query.columns,
    'Rows and columns must use different axes',
  );

/** A Widget query as callers write it (defaults may be left out). */
export type WidgetQueryInput = z.input<typeof widgetQueryInput>;
/** A Widget query with every default filled in. */
export type WidgetQuery = z.output<typeof widgetQueryInput>;
