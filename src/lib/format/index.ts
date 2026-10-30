/**
 * The one shared formatter for amounts and dates. Every screen renders numbers and dates
 * through it, so the user's display settings apply everywhere. Pure: safe on server and client.
 *
 * Server components: `const fmt = await getFormatter()` from `@/server/formatter`.
 * Client components: `const fmt = useFormatter()` from `@/components/formatter-provider`.
 */

export const NUMBER_FORMATS = {
  apostrophe: { group: "'", decimal: '.', example: "1'234.50" },
  comma: { group: ',', decimal: '.', example: '1,234.50' },
  dot: { group: '.', decimal: ',', example: '1.234,50' },
  space: { group: ' ', decimal: ',', example: '1 234,50' },
} as const;

export type NumberFormat = keyof typeof NUMBER_FORMATS;

export const DATE_FORMATS = ['dd.mm.yyyy', 'dd/mm/yyyy', 'yyyy-mm-dd', 'mm/dd/yyyy'] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

export interface DisplaySettings {
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
}

/** Swiss by default: 1'234.50 and dd.mm.yyyy. */
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  numberFormat: 'apostrophe',
  dateFormat: 'dd.mm.yyyy',
};

export interface AmountOptions {
  /** ISO code. Sets the number of decimals and, when given, prefixes the result ("CHF 1'234.50"). */
  currency?: string;
}

export interface Formatter {
  readonly settings: DisplaySettings;
  /** Formats an amount held as integer minor units (ADR-0002). */
  amount(minor: number, options?: AmountOptions): string;
  /** Formats an ISO date (`YYYY-MM-DD`), or a timestamp in Swiss local time. */
  date(value: string | Date): string;
  /** Formats a share between 0 and 1 as a percentage with one decimal ("1.2%"). */
  percent(share: number): string;
}

const DEFAULT_FRACTION_DIGITS = 2;
const fractionDigitsCache = new Map<string, number>();

/** Minor-unit decimals of a Currency (2 when none is given). */
export function fractionDigits(currency: string | undefined): number {
  if (!currency) return DEFAULT_FRACTION_DIGITS;
  let digits = fractionDigitsCache.get(currency);
  if (digits === undefined) {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? DEFAULT_FRACTION_DIGITS;
    fractionDigitsCache.set(currency, digits);
  }
  return digits;
}

function groupThousands(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

export function formatAmount(
  minor: number,
  numberFormat: NumberFormat,
  options: AmountOptions = {},
): string {
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`Amount must be an integer number of minor units, got ${minor}`);
  }
  const { group, decimal } = NUMBER_FORMATS[numberFormat];
  const digits = fractionDigits(options.currency);
  const scale = 10 ** digits;
  const abs = Math.abs(minor);
  const whole = groupThousands(String(Math.floor(abs / scale)), group);
  const fraction = digits > 0 ? decimal + String(abs % scale).padStart(digits, '0') : '';
  const sign = minor < 0 ? '-' : '';
  const number = `${sign}${whole}${fraction}`;
  return options.currency ? `${options.currency} ${number}` : number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_TIME_ZONE = 'Europe/Zurich';

function isoDateInZurich(value: Date): string {
  // en-CA renders dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function formatDate(value: string | Date, dateFormat: DateFormat): string {
  const iso = value instanceof Date ? isoDateInZurich(value) : value;
  const match = ISO_DATE.exec(iso);
  if (!match) {
    throw new Error(`Expected an ISO date (YYYY-MM-DD), got "${iso}"`);
  }
  const [, yyyy, mm, dd] = match as unknown as [string, string, string, string];
  return dateFormat.replace('yyyy', yyyy).replace('mm', mm).replace('dd', dd);
}

const PERCENT_TENTHS = 1000;

export function formatPercent(share: number, numberFormat: NumberFormat): string {
  const tenths = Math.round(share * PERCENT_TENTHS);
  const sign = tenths < 0 ? '-' : '';
  const abs = Math.abs(tenths);
  const { group, decimal } = NUMBER_FORMATS[numberFormat];
  const whole = groupThousands(String(Math.floor(abs / 10)), group);
  return `${sign}${whole}${decimal}${abs % 10}%`;
}

export function createFormatter(settings: DisplaySettings): Formatter {
  return {
    settings,
    amount: (minor, options) => formatAmount(minor, settings.numberFormat, options),
    date: (value) => formatDate(value, settings.dateFormat),
    percent: (share) => formatPercent(share, settings.numberFormat),
  };
}
