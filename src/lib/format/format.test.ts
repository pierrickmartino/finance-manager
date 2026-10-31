import { describe, expect, it } from 'vitest';
import { createFormatter, DEFAULT_DISPLAY_SETTINGS, formatPeriod } from '.';

describe('formatter with Swiss defaults', () => {
  const fmt = createFormatter(DEFAULT_DISPLAY_SETTINGS);

  it.each([
    [123450, "1'234.50"],
    [-123450, "-1'234.50"],
    [0, '0.00'],
    [5, '0.05'],
    [-5, '-0.05'],
    [99, '0.99'],
    [100000000, "1'000'000.00"],
  ])('formats %i minor units as %s', (minor, expected) => {
    expect(fmt.amount(minor)).toBe(expected);
  });

  it('prefixes the Currency when asked', () => {
    expect(fmt.amount(123450, { currency: 'EUR' })).toBe("EUR 1'234.50");
  });

  it('rounds to whole units for chart axes, half away from zero', () => {
    expect(fmt.amount(123450, { isWhole: true })).toBe("1'235");
    expect(fmt.amount(-123449, { isWhole: true })).toBe("-1'234");
    expect(fmt.amount(-50, { isWhole: true, currency: 'CHF' })).toBe('CHF -1');
    expect(fmt.amount(0, { isWhole: true })).toBe('0');
  });

  it('formats an ISO date as dd.mm.yyyy', () => {
    expect(fmt.date('2024-03-07')).toBe('07.03.2024');
  });
});

describe('formatter with other display settings', () => {
  it.each([
    ['comma', '-1,234,567.89'],
    ['dot', '-1.234.567,89'],
    ['space', '-1 234 567,89'],
  ] as const)('formats amounts with the %s number format', (numberFormat, expected) => {
    const fmt = createFormatter({ numberFormat, dateFormat: 'dd.mm.yyyy' });
    expect(fmt.amount(-123456789)).toBe(expected);
  });

  it.each([
    ['dd/mm/yyyy', '31/12/2025'],
    ['yyyy-mm-dd', '2025-12-31'],
    ['mm/dd/yyyy', '12/31/2025'],
  ] as const)('formats dates as %s', (dateFormat, expected) => {
    const fmt = createFormatter({ numberFormat: 'apostrophe', dateFormat });
    expect(fmt.date('2025-12-31')).toBe(expected);
  });

  it('formats a timestamp by its date in Swiss local time', () => {
    const fmt = createFormatter(DEFAULT_DISPLAY_SETTINGS);
    // 23:30 UTC on 31 Dec is already 1 Jan in Zurich.
    expect(fmt.date(new Date('2025-12-31T23:30:00Z'))).toBe('01.01.2026');
  });

  it('uses the Currency decimals', () => {
    const fmt = createFormatter(DEFAULT_DISPLAY_SETTINGS);
    expect(fmt.amount(123450, { currency: 'JPY' })).toBe("JPY 123'450");
  });

  it('rejects amounts that are not integer minor units', () => {
    const fmt = createFormatter(DEFAULT_DISPLAY_SETTINGS);
    expect(() => fmt.amount(12.5)).toThrow('integer number of minor units');
  });
});

describe('percent', () => {
  it.each([
    [0.25, '25.0%'],
    [0.0123, '1.2%'],
    [0.02, '2.0%'],
    [0, '0.0%'],
    [1, '100.0%'],
  ])('formats the share %d as %s', (share, expected) => {
    expect(createFormatter(DEFAULT_DISPLAY_SETTINGS).percent(share)).toBe(expected);
  });

  it("uses the number format's decimal separator", () => {
    const fmt = createFormatter({ ...DEFAULT_DISPLAY_SETTINGS, numberFormat: 'dot' });
    expect(fmt.percent(0.0123)).toBe('1,2%');
  });
});

describe('period', () => {
  it.each([
    ['2025-03', 'Mar 2025'],
    ['2024-12', 'Dec 2024'],
    ['2025-Q1', 'Q1 2025'],
    ['2025', '2025'],
  ])('formats the period key %s as %s', (key, expected) => {
    expect(createFormatter(DEFAULT_DISPLAY_SETTINGS).period(key)).toBe(expected);
    expect(formatPeriod(key)).toBe(expected);
  });

  it('refuses something that is not a period key', () => {
    expect(() => formatPeriod('2025-13')).toThrow('Expected a period key');
    expect(() => formatPeriod('March')).toThrow('Expected a period key');
  });
});

describe('dateTime', () => {
  // 2025-07-01 08:05:09 UTC is 10:05:09 in Zurich (summer time).
  const at = new Date('2025-07-01T08:05:09Z');

  it('formats a timestamp as the date in the user format and the Swiss local time', () => {
    expect(createFormatter(DEFAULT_DISPLAY_SETTINGS).dateTime(at)).toBe('01.07.2025 10:05');
  });

  it('adds seconds when asked, and follows the date format', () => {
    const fmt = createFormatter({ ...DEFAULT_DISPLAY_SETTINGS, dateFormat: 'yyyy-mm-dd' });

    expect(fmt.dateTime(at, { hasSeconds: true })).toBe('2025-07-01 10:05:09');
  });

  it('uses Swiss winter time in January', () => {
    const fmt = createFormatter(DEFAULT_DISPLAY_SETTINGS);

    expect(fmt.dateTime(new Date('2025-01-15T23:30:00Z'))).toBe('16.01.2025 00:30');
  });
});
