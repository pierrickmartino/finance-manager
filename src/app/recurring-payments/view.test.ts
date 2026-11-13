import { describe, expect, it } from 'vitest';
import { createFormatter, DEFAULT_DISPLAY_SETTINGS } from '@/lib/format';
import { aroundDate, badgesOf, cadenceLabel, yearlyCostWorking } from './view';

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

describe('cadenceLabel', () => {
  it('reads monthly in sentence case', () => {
    expect(cadenceLabel('monthly')).toBe('Monthly');
  });
});

describe('badgesOf', () => {
  const payment: Parameters<typeof badgesOf>[0] = {
    currency: 'CHF',
    lastAmountMinor: 1100,
    previousAmountMinor: 1000,
    state: 'active',
    flags: [],
  };

  it('has no badge for an active series with no flag', () => {
    expect(badgesOf(payment, fmt)).toEqual([]);
  });

  it('shows a price increase with both amounts, and New', () => {
    expect(badgesOf({ ...payment, flags: ['price_increase', 'new'] }, fmt)).toEqual([
      { label: 'Up from CHF 10.00 to CHF 11.00', tone: 'warning' },
      { label: 'New', tone: 'info' },
    ]);
  });

  it('shows Missed as a warning and "Not yet imported" as neutral status, before the flags', () => {
    expect(badgesOf({ ...payment, state: 'missed', flags: ['new'] }, fmt)).toEqual([
      { label: 'Missed', tone: 'warning' },
      { label: 'New', tone: 'info' },
    ]);
    expect(badgesOf({ ...payment, state: 'not_yet_imported' }, fmt)).toEqual([
      { label: 'Not yet imported', tone: 'info' },
    ]);
  });
});
