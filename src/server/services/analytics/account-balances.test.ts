import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection, seedAccount, seedClassified } from '@test/support/analytics';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';

/** Analytics' Account balances in CHF (spec #170, user stories 25-26). */

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Today is 20 March 2025. UBS (CHF) holds 1'000.00 after a salary and a purchase, and a
 * purchase booked tomorrow isn't counted yet. CA (EUR) holds EUR 200.00, at 0.94 today.
 */
async function dataset(): Promise<{ ubs: string; ca: string }> {
  const ubs = await seedAccount(t.ctx, 'UBS');
  const ca = await seedAccount(t.ctx, 'CA', 'EUR');
  await seedEurRates(t.ctx, [
    ['2025-01-10', '0.9000'],
    ['2025-03-20', '0.9400'],
  ]);
  await seedClassified(t.ctx, ubs, [
    { bookingDate: '2025-01-25', amountMinor: 120_000 },
    { bookingDate: '2025-03-05', amountMinor: -20_000 },
    { bookingDate: '2025-03-21', amountMinor: -50_000 },
  ]);
  await seedClassified(t.ctx, ca, [{ bookingDate: '2025-01-10', amountMinor: 20_000 }]);
  return { ubs: ubs.id, ca: ca.id };
}

describe('Account balances in CHF', () => {
  it("lists each Account's balance today, converted to CHF at today's rate, and their total", async () => {
    fixToday('2025-03-20');
    const { ubs, ca } = await dataset();

    const balances = await loadSection(t.ctx, 'month', 'accountBalances');

    expect(balances.date).toBe('2025-03-20');
    expect(balances.rows).toEqual([
      { accountId: ca, label: 'Bank CA · CA', chfMinor: 18_800 },
      { accountId: ubs, label: 'Bank UBS · UBS', chfMinor: 100_000 },
    ]);
    expect(balances.totalChfMinor).toBe(118_800);
    expect(balances.unconvertedCount).toBe(0);
  });

  it('is identical whatever the Period view', async () => {
    fixToday('2025-03-20');
    await dataset();

    const year = await loadSection(t.ctx, 'year', 'accountBalances');
    const quarter = await loadSection(t.ctx, 'quarter', 'accountBalances');
    const month = await loadSection(t.ctx, 'month', 'accountBalances');

    expect(month.rows).toHaveLength(2);
    expect(quarter).toEqual(month);
    expect(year).toEqual(month);
  });

  it('leaves an Account with no FX rate yet out of the total, and counts it', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    const ca = await seedAccount(t.ctx, 'CA', 'EUR');
    await seedClassified(t.ctx, ubs, [{ bookingDate: '2025-03-01', amountMinor: 5_000 }]);
    await seedClassified(t.ctx, ca, [{ bookingDate: '2025-03-01', amountMinor: 7_000 }]);

    const balances = await loadSection(t.ctx, 'month', 'accountBalances');

    expect(balances.rows.map((row) => row.chfMinor)).toEqual([null, 5_000]);
    expect(balances.totalChfMinor).toBe(5_000);
    expect(balances.unconvertedCount).toBe(1);
  });

  it('is empty with no Accounts yet', async () => {
    fixToday('2025-03-20');

    const balances = await loadSection(t.ctx, 'month', 'accountBalances');

    expect(balances.rows).toEqual([]);
    expect(balances.totalChfMinor).toBeNull();
    expect(balances.isEmpty).toBe(true);
  });
});
