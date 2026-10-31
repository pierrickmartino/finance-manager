const AMOUNT = /^([+-])?(\d*)(?:[.,](\d{1,2}))?$/;

/**
 * Parses a decimal amount such as `-1500.00`, `23,8` or `.3` into signed minor units, without
 * floats. The whole part may be omitted (`.3` = `0.30`), as BCGE's CAMT.053 writes it.
 */
export function parseMinor(raw: string): number {
  const text = raw.trim().replace(/['\s]/g, '');
  const match = AMOUNT.exec(text);
  if (!match || (match[2] === '' && match[3] === undefined)) throw new Error(`Not an amount: "${raw}"`);
  const [, sign, units = '', cents = ''] = match;
  const minor = Number(units || '0') * 100 + Number(cents.padEnd(2, '0'));
  return sign === '-' ? -minor : minor;
}
