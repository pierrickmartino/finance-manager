import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { archiveAccount, createAccount } from '../accounts';
import { recordBalanceSnapshot } from '../balance-snapshots';
import { createBank } from '../banks';
import type { AnalyticsNetWorth } from '.';

/** Analytics' Net worth (spec #170, user stories 14-17): today, its trend and its change. */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Today is 20 March 2025. Francs (CHF) opens mid-January 2025 with 1000.00, gains 200.00 in
 * February and loses 50.00 in March. Euros (EUR, archived but still holding 1000.00) opens in
 * December 2024. A Mortgage opens on 1 January 2025 at -3000.00 and is recorded at -2500.00
 * at the end of February. EUR is at 0.94 from the end of 2024 and 0.95 from the end of
 * February.
 */
async function dataset(): Promise<void> {
  const bank = await createBank(t.ctx, { name: 'BCGE' });
  const base = { bankId: bank.id, importFormat: null };
  const francs = await createAccount(t.ctx, {
    ...base,
    kind: 'current',
    name: 'Francs',
    currency: 'CHF',
    openingBalanceMinor: 100_000,
    openingDate: '2025-01-15',
  });
  await seedTransactions(t.ctx.db, francs, [
    { bookingDate: '2025-02-10', amountMinor: 20_000 },
    { bookingDate: '2025-03-05', amountMinor: -5_000 },
  ]);
  const euros = await createAccount(t.ctx, {
    ...base,
    kind: 'savings',
    name: 'Euros',
    currency: 'EUR',
    openingBalanceMinor: 100_000,
    openingDate: '2024-12-01',
  });
  await archiveAccount(t.ctx, euros.id);
  const loan = await createAccount(t.ctx, {
    ...base,
    kind: 'loan',
    name: 'Mortgage',
    currency: 'CHF',
    openingBalanceMinor: -300_000,
    openingDate: '2025-01-01',
  });
  await recordBalanceSnapshot(t.ctx, {
    accountId: loan.id,
    date: '2025-02-28',
    balanceMinor: -250_000,
  });
  await seedEurRates(t.ctx, [
    ['2024-12-31', '0.9400'],
    ['2025-02-28', '0.9500'],
  ]);
}

// Today: Francs 1150.00, Euros 1000.00 EUR at 0.95, the Mortgage at -2500.00.
const TODAY = 115_000 + 95_000 - 250_000;
// The end of 2024: only Euros, at 0.94.
const END_OF_2024 = 94_000;

const dated = (netWorth: AnalyticsNetWorth) =>
  netWorth.points.map((point) => [point.date, point.value]);

describe('Net worth', () => {
  it('in Month, has a point at each month end of the window and today, its change since February', async () => {
    fixToday('2025-03-20');
    await dataset();

    const netWorth = await loadSection(t.ctx, 'month', 'netWorth');

    expect(netWorth.today).toEqual({ date: '2025-03-20', value: TODAY });
    expect(dated(netWorth)).toEqual([
      ...['2024-04-30', '2024-05-31', '2024-06-30', '2024-07-31'].map((date) => [date, 0]),
      ...['2024-08-31', '2024-09-30', '2024-10-31', '2024-11-30'].map((date) => [date, 0]),
      ['2024-12-31', END_OF_2024],
      // January: Francs at its opening, the Mortgage at its opening.
      ['2025-01-31', 100_000 + 94_000 - 300_000],
      ['2025-02-28', 120_000 + 95_000 - 250_000],
      ['2025-03-20', TODAY],
    ]);
    expect(netWorth.points.at(-1)).toMatchObject({ key: '2025-03', isToDate: true });
    expect(netWorth.points.slice(0, -1).every((point) => !point.isToDate)).toBe(true);
    // Francs lost 50.00 since the end of February; nothing else moved.
    expect(netWorth.change).toEqual({
      since: { key: '2025-02', label: 'Feb 2025', date: '2025-02-28' },
      value: -5_000,
    });
    expect(netWorth.unconvertedCount).toBe(0);
  });

  it('in Quarter, has a point at each quarter end of the window and today, its change since Q4', async () => {
    fixToday('2025-03-20');
    await dataset();

    const netWorth = await loadSection(t.ctx, 'quarter', 'netWorth');

    expect(netWorth.today).toEqual({ date: '2025-03-20', value: TODAY });
    expect(dated(netWorth)).toEqual([
      ...['2023-06-30', '2023-09-30', '2023-12-31'].map((date) => [date, 0]),
      ...['2024-03-31', '2024-06-30', '2024-09-30'].map((date) => [date, 0]),
      ['2024-12-31', END_OF_2024],
      ['2025-03-20', TODAY],
    ]);
    expect(netWorth.change).toEqual({
      since: { key: '2024-Q4', label: 'Q4 2024', date: '2024-12-31' },
      value: TODAY - END_OF_2024,
    });
  });

  it('in Year, has a point at each year end of the window and today, its change since 2024', async () => {
    fixToday('2025-03-20');
    await dataset();

    const netWorth = await loadSection(t.ctx, 'year', 'netWorth');

    expect(netWorth.today).toEqual({ date: '2025-03-20', value: TODAY });
    expect(dated(netWorth)).toEqual([
      ...['2020-12-31', '2021-12-31', '2022-12-31', '2023-12-31'].map((date) => [date, 0]),
      ['2024-12-31', END_OF_2024],
      ['2025-03-20', TODAY],
    ]);
    expect(netWorth.change).toEqual({
      since: { key: '2024', label: '2024', date: '2024-12-31' },
      value: TODAY - END_OF_2024,
    });
  });

  it('has nothing to show without an Account', async () => {
    fixToday('2025-03-20');

    const netWorth = await loadSection(t.ctx, 'month', 'netWorth');

    expect(netWorth).toEqual({
      today: null,
      points: [],
      change: null,
      isEmpty: true,
      unconvertedCount: 0,
    });
  });
});
