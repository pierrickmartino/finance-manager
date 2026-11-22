import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection, seedAccount, seedClassified } from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/spans';
import { setupTestDatabase } from '@test/support/db';

/** Analytics' Recent transactions (spec #170, user stories 23-24). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

const descriptions = (transactions: { rawDescription: string }[]) =>
  transactions.map((transaction) => transaction.rawDescription);

describe('Recent transactions', () => {
  it('lists the 6 latest Transactions, newest first, from before the Span too', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2019-06-01', amountMinor: -100, rawDescription: 'Oldest' },
      { bookingDate: '2019-07-01', amountMinor: -200, rawDescription: 'Bakery' },
      { bookingDate: '2019-08-01', amountMinor: 300, rawDescription: 'Refund' },
      { bookingDate: '2025-03-19', amountMinor: -400, rawDescription: 'Grocer' },
      { bookingDate: '2025-02-01', amountMinor: -500, rawDescription: 'Rent' },
      { bookingDate: '2025-03-20', amountMinor: 600, rawDescription: 'Salary' },
      { bookingDate: '2024-12-24', amountMinor: -700, rawDescription: 'Gifts' },
    ]);

    const recent = await loadSection(t.ctx, MONTHLY, 'recentTransactions');

    expect(descriptions(recent)).toEqual(['Salary', 'Grocer', 'Rent', 'Gifts', 'Refund', 'Bakery']);
    expect(recent[0]).toMatchObject({ bookingDate: '2025-03-20', amountMinor: 600 });
  });

  it('is identical whatever the Span', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    await seedClassified(t.ctx, ubs, [
      { bookingDate: '2018-01-01', amountMinor: -100, rawDescription: 'Long ago' },
      { bookingDate: '2025-03-01', amountMinor: -200, rawDescription: 'This month' },
    ]);

    const year = await loadSection(t.ctx, YEARLY, 'recentTransactions');
    const quarter = await loadSection(t.ctx, QUARTERLY, 'recentTransactions');
    const month = await loadSection(t.ctx, MONTHLY, 'recentTransactions');

    expect(descriptions(month)).toEqual(['This month', 'Long ago']);
    expect(quarter).toEqual(month);
    expect(year).toEqual(month);
  });

  it('is empty with no Transactions yet', async () => {
    fixToday('2025-03-20');

    expect(await loadSection(t.ctx, MONTHLY, 'recentTransactions')).toEqual([]);
  });
});
