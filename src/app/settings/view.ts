import {
  DATE_FORMATS,
  formatDate,
  NUMBER_FORMATS,
  type DateFormat,
  type NumberFormat,
} from '@/lib/format';

/** The date every date-format choice and the summary are written with. */
export const SAMPLE_DATE = '2025-12-31';

/** The amount (minor units, CHF) the summary is written with. */
export const SAMPLE_AMOUNT_MINOR = -123_456_789;

export interface FormatChoice<T extends string> {
  value: T;
  /** The choice written out, so the user picks by what it looks like. */
  label: string;
  /** Which convention it is. */
  hint: string;
}

const NUMBER_FORMAT_HINTS: Record<NumberFormat, string> = {
  apostrophe: 'Swiss',
  comma: 'English',
  dot: 'German',
  space: 'French',
};

const DATE_FORMAT_HINTS: Record<DateFormat, string> = {
  'dd.mm.yyyy': 'Day first, dots',
  'dd/mm/yyyy': 'Day first, slashes',
  'yyyy-mm-dd': 'ISO 8601',
  'mm/dd/yyyy': 'Month first',
};

export function numberFormatChoices(): FormatChoice<NumberFormat>[] {
  return (Object.keys(NUMBER_FORMATS) as NumberFormat[]).map((value) => ({
    value,
    label: NUMBER_FORMATS[value].example,
    hint: NUMBER_FORMAT_HINTS[value],
  }));
}

export function dateFormatChoices(): FormatChoice<DateFormat>[] {
  return DATE_FORMATS.map((value) => ({
    value,
    label: formatDate(SAMPLE_DATE, value),
    hint: DATE_FORMAT_HINTS[value],
  }));
}
