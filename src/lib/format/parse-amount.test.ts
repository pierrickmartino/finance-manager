import { describe, expect, it } from 'vitest';
import { parseAmount } from './parse-amount';

describe('parseAmount', () => {
  it.each([
    ["1'234.50", 'apostrophe', 'CHF', 123450],
    ['1234.5', 'apostrophe', 'CHF', 123450],
    ['-12', 'apostrophe', 'CHF', -1200],
    ['+0.05', 'comma', 'EUR', 5],
    ['1,234,567.89', 'comma', 'EUR', 123456789],
    ['1.234,50', 'dot', 'EUR', 123450],
    ['1 234,50', 'space', 'EUR', 123450],
    ['  -0,1 ', 'space', 'EUR', -10],
    ['1234', 'apostrophe', 'JPY', 1234],
    ['90071992547409.91', 'apostrophe', 'CHF', 9007199254740991],
  ] as const)('reads "%s" (%s, %s) as %i minor units', (text, format, currency, minor) => {
    expect(parseAmount(text, format, currency)).toBe(minor);
  });

  it.each([
    ['', 'apostrophe', 'CHF'],
    ['abc', 'apostrophe', 'CHF'],
    ['1.234', 'apostrophe', 'CHF'],
    ['1,5', 'apostrophe', 'CHF'],
    ['1.5', 'dot', 'EUR'],
    ['1.5', 'apostrophe', 'JPY'],
    ['--1', 'apostrophe', 'CHF'],
    ['90071992547409.92', 'apostrophe', 'CHF'],
  ] as const)('rejects "%s" (%s, %s)', (text, format, currency) => {
    expect(parseAmount(text, format, currency)).toBeNull();
  });
});
