const AMOUNT = /^([+-])?(\d+)(?:[.,](\d{1,2}))?$/;

/** Parses a decimal amount such as `-1500.00` or `23,8` into signed minor units, without floats. */
export function parseMinor(raw: string): number {
  const text = raw.trim().replace(/['\s]/g, '');
  const match = AMOUNT.exec(text);
  if (!match) throw new Error(`Not an amount: "${raw}"`);
  const [, sign, units = '0', cents = ''] = match;
  const minor = Number(units) * 100 + Number(cents.padEnd(2, '0'));
  return sign === '-' ? -minor : minor;
}
