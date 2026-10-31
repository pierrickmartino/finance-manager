import { expect, test } from 'vitest';
import { reconciles } from '../src/index.ts';

const entries = [
  { bookingDate: '2025-03-02', amount: -2500, runningBalance: 7500 },
  { bookingDate: '2025-03-01', amount: 5000, runningBalance: 10000 },
];

test('reconciles newest-first entries whose balances chain to the closing balance', () => {
  expect(reconciles({ currency: 'CHF', openingBalance: 5000, closingBalance: 7500, entries })).toBe(true);
});

test('detects a closing balance that does not match the movements', () => {
  expect(reconciles({ currency: 'CHF', openingBalance: 5000, closingBalance: 7600, entries })).toBe(false);
});

test('detects a gap in the running balance', () => {
  const gap = [{ ...entries[0]!, runningBalance: 7400 }, entries[1]!];
  expect(reconciles({ currency: 'CHF', openingBalance: 5000, entries: gap })).toBe(false);
});

test('ignores entries that are not booked', () => {
  const pending = [...entries, { bookingDate: '2025-02-28', amount: -100, status: 'PDNG' }];
  expect(reconciles({ currency: 'CHF', openingBalance: 5000, closingBalance: 7500, entries: pending })).toBe(true);
});
