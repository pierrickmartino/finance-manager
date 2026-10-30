import { fractionDigits, NUMBER_FORMATS, type NumberFormat } from './index';

/** Other characters people type for the same group separator (curly apostrophe, no-break spaces). */
const SPACES = ' \u00a0\u202f';
const GROUP_ALIASES: Record<string, string> = {
  "'": "'\u2019",
  ' ': SPACES,
  '\u00a0': SPACES,
  '\u202f': SPACES,
};

function escapeForClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, '\\$&');
}

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads an amount typed in the user's number format (e.g. "1'234.50") as integer minor units
 * of `currency` (ADR-0002). Group separators are optional but must sit every three digits.
 * Returns null when the text is not such an amount, or too large to hold exactly.
 */
export function parseAmount(
  text: string,
  numberFormat: NumberFormat,
  currency?: string,
): number | null {
  const { group, decimal } = NUMBER_FORMATS[numberFormat];
  const digits = fractionDigits(currency);
  const groupClass = `[${escapeForClass(GROUP_ALIASES[group] ?? group)}]`;
  const decimalPart = digits > 0 ? `(?:${escapeForPattern(decimal)}(\\d{1,${digits}}))?` : '';
  const pattern = new RegExp(`^([+-]?)(\\d{1,3}(?:${groupClass}\\d{3})+|\\d+)${decimalPart}$`);

  const match = pattern.exec(text.trim());
  if (!match) return null;
  const [, sign, whole = '', fraction = ''] = match;
  const unsigned = whole.replace(/\D/g, '') + fraction.padEnd(digits, '0');
  const minor = Number(unsigned) * (sign === '-' ? -1 : 1);
  return Number.isSafeInteger(minor) ? minor : null;
}
