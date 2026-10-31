import { fractionDigits } from '@/lib/format';
import { normalizeIban } from '../../accounts/input';
import { UnreadableFileError } from './types';

/** Shared readers for the values found in bank files. They throw `UnreadableFileError`. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` date that exists on the calendar. */
export function readIsoDate(text: string, what: string): string {
  const match = ISO_DATE.exec(text.trim());
  const date = match ? new Date(`${match[0]}T00:00:00Z`) : null;
  if (
    !match ||
    !date ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== match[0]
  ) {
    throw new UnreadableFileError(`${what} "${text}" is not a date`);
  }
  return match[0];
}

/**
 * A plain decimal amount (`-87.45`, `+500.00`, `1187,35`, `.3`), no thousands separators, read
 * as integer minor units of `currency`. The whole part may be omitted (`.3` = `0.30`), as in
 * `xs:decimal`: BCGE's CAMT.053 writes sub-unit amounts that way. More decimals than the
 * Currency has are refused.
 */
export function readDecimalMinor(
  text: string,
  currency: string,
  what: string,
  decimalSeparator: '.' | ',' = '.',
): number {
  const digits = fractionDigits(currency);
  const sep = decimalSeparator === '.' ? '\\.' : ',';
  const pattern = new RegExp(`^([+-]?)(\\d*)(?:${sep}(\\d{1,${Math.max(digits, 1)}}))?$`);
  const match = pattern.exec(text.trim());
  if (!match || (match[2] === '' && !match[3]) || (digits === 0 && match[3])) {
    throw new UnreadableFileError(`${what} "${text}" is not an amount`);
  }
  const [, sign, whole = '', fraction = ''] = match;
  const minor = Number(whole + fraction.padEnd(digits, '0'));
  if (!Number.isSafeInteger(minor)) {
    throw new UnreadableFileError(`${what} "${text}" is too large`);
  }
  return sign === '-' ? -minor : minor;
}

/** An ISO 4217 code. */
export function readCurrency(text: string, what: string): string {
  const code = text.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code))
    throw new UnreadableFileError(`${what} "${text}" is not a currency`);
  return code;
}

export { normalizeIban };

/** Trimmed text, or null when blank. */
export function textOrNull(text: string | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
