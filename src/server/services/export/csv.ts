/** Writing CSV (RFC 4180): comma separated, CRLF line ends, quotes only where needed. */

/** Byte order mark, so Excel reads the file as UTF-8. */
export const BOM = '\uFEFF';
const LINE_END = '\r\n';
const NEEDS_QUOTES = /[",\r\n]/;
/** Characters that make a spreadsheet read a cell as a formula (CSV/formula injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, quoted when it holds a separator, a quote or a line break. */
function cell(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** One CSV line, line end included. */
export function csvLine(values: readonly string[]): string {
  return values.map(cell).join(',') + LINE_END;
}

/**
 * A text cell from bank files or typed by hand: one that a spreadsheet would run as a formula
 * (starting with `=`, `+`, `-`, `@`, a tab or a carriage return) gets a leading apostrophe, so
 * it shows as text. Numbers never go through here.
 */
export function textCell(value: string | null): string {
  if (value === null) return '';
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/**
 * Minor units as a plain decimal number (`-1234.56`): point as decimal separator, no thousands
 * separators, whatever the user's display format.
 */
export function decimalCell(minor: number, digits: number): string {
  const sign = minor < 0 ? '-' : '';
  const units = String(Math.abs(minor)).padStart(digits + 1, '0');
  if (digits === 0) return sign + units;
  return `${sign}${units.slice(0, -digits)}.${units.slice(-digits)}`;
}
