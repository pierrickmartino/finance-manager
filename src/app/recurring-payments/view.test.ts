import { describe, expect, it } from 'vitest';
import { createFormatter, DEFAULT_DISPLAY_SETTINGS } from '@/lib/format';
import { aroundDate, cadenceLabel, chargeFromParams, drillHref, yearlyCostWorking } from './view';

const fmt = createFormatter(DEFAULT_DISPLAY_SETTINGS);

describe('aroundDate', () => {
  it('names the day and month in the current year', () => {
    expect(aroundDate('2025-04-05', '2025-03-20')).toBe('around 5 April');
  });

  it('adds the year when it is not the current one', () => {
    expect(aroundDate('2026-01-02', '2025-12-20')).toBe('around 2 January 2026');
  });
});

describe('yearlyCostWorking', () => {
  it('shows a CHF series as its last amount times its charges per year', () => {
    expect(
      yearlyCostWorking(
        { currency: 'CHF', lastAmountMinor: 2190, chargesPerYear: 12, yearlyCost: null },
        fmt,
      ),
    ).toBe('CHF 21.90 × 12');
  });

  it('adds the FX rate used for a series in another Currency', () => {
    expect(
      yearlyCostWorking(
        {
          currency: 'EUR',
          lastAmountMinor: 999,
          chargesPerYear: 12,
          yearlyCost: {
            amountMinor: 11149,
            rate: {
              currency: 'EUR',
              date: '2025-10-04',
              rateDate: '2025-10-03',
              rateToChf: '0.93',
            },
          },
        },
        fmt,
      ),
    ).toBe('EUR 9.99 × 12 at 0.93 CHF/EUR');
  });

  it('writes the rate with the decimal separator of the number format', () => {
    const dot = createFormatter({ numberFormat: 'dot', dateFormat: 'dd.mm.yyyy' });
    expect(
      yearlyCostWorking(
        {
          currency: 'EUR',
          lastAmountMinor: 999,
          chargesPerYear: 12,
          yearlyCost: {
            amountMinor: 11149,
            rate: {
              currency: 'EUR',
              date: '2025-10-04',
              rateDate: '2025-10-03',
              rateToChf: '0.93',
            },
          },
        },
        dot,
      ),
    ).toBe('EUR 9,99 × 12 at 0,93 CHF/EUR');
  });
});

describe('the Drill-down link', () => {
  const LAST = '2b8e6f3a-5c74-4fa0-9c90-3b4f5e6d7c82';
  const charges = [
    { kind: 'transaction', id: '1c7a5d2f-4b63-4e9f-8b8f-2a3e4d5c6b71' },
    { kind: 'transaction', id: LAST },
  ] as const;

  it('names the series by its latest charge and reads that charge back', () => {
    const href = drillHref({ charges });

    expect(href).toBe(`/recurring-payments/drill?charge=transaction%3A${LAST}`);
    const params = Object.fromEntries(new URL(href, 'http://localhost').searchParams);
    expect(chargeFromParams(params)).toEqual({ kind: 'transaction', id: LAST });
  });

  it('reads nothing back from a missing or malformed charge', () => {
    for (const params of [{}, { charge: LAST }, { charge: 'transaction:' }, { charge: ':x' }]) {
      expect(chargeFromParams(params)).toBeNull();
    }
  });
});

describe('cadenceLabel', () => {
  it('reads monthly in sentence case', () => {
    expect(cadenceLabel('monthly')).toBe('Monthly');
  });
});
