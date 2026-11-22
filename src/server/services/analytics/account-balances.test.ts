import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection, seedAccount, seedClassified } from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/spans';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { readCard } from '@/lib/reporting/card';

/** Analytics' Account balances in CHF, the Dashboard's share card (spec #170). */

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

const money = String;

describe('Account balances in CHF', () => {
  it("is a share card of each Account's balance today, converted to CHF at today's rate", async () => {
    fixToday('2025-03-20');
    const { ubs, ca } = await dataset();

    const card = await loadSection(t.ctx, MONTHLY, 'accountBalances');
    const reading = readCard(card, money);

    expect(card.name).toBe('Account balances in CHF');
    expect(card.source).toBe('account_balances');
    expect(reading.kind).toBe('share');
    expect(card.data!.rowTotals).toEqual([18_800, 100_000]);
    expect(card.data!.total).toBe(118_800);
    expect(card.unconvertedCount).toBe(0);
    expect(reading.lead).toEqual({
      headline: '84% sits in Bank UBS · UBS',
      detail: '100000 of 118800',
      href: `/accounts/${ubs}`,
    });
    expect(reading.mark).toMatchObject({
      type: 'ticks',
      items: [
        {
          title: 'Bank UBS · UBS',
          detail: '100000',
          share: 100_000 / 118_800,
          href: `/accounts/${ubs}`,
        },
        {
          title: 'Bank CA · CA',
          detail: '18800',
          share: 18_800 / 118_800,
          href: `/accounts/${ca}`,
        },
      ],
    });
  });

  it('is identical whatever the Span', async () => {
    fixToday('2025-03-20');
    await dataset();

    const year = await loadSection(t.ctx, YEARLY, 'accountBalances');
    const quarter = await loadSection(t.ctx, QUARTERLY, 'accountBalances');
    const month = await loadSection(t.ctx, MONTHLY, 'accountBalances');

    expect(month.data!.rows).toHaveLength(2);
    expect(quarter).toEqual(month);
    expect(year).toEqual(month);
  });

  it('leaves an Account with no FX rate yet out of the total, and counts it', async () => {
    fixToday('2025-03-20');
    const ubs = await seedAccount(t.ctx, 'UBS');
    const ca = await seedAccount(t.ctx, 'CA', 'EUR');
    await seedClassified(t.ctx, ubs, [{ bookingDate: '2025-03-01', amountMinor: 5_000 }]);
    await seedClassified(t.ctx, ca, [{ bookingDate: '2025-03-01', amountMinor: 7_000 }]);

    const card = await loadSection(t.ctx, MONTHLY, 'accountBalances');

    expect(card.data!.rowTotals).toEqual([null, 5_000]);
    expect(card.data!.total).toBe(5_000);
    expect(card.unconvertedCount).toBe(1);
  });

  it('is empty with no Accounts yet', async () => {
    fixToday('2025-03-20');

    const card = await loadSection(t.ctx, MONTHLY, 'accountBalances');

    expect(card.data!.rows).toEqual([]);
    expect(card.data!.total).toBeNull();
    expect(card.isEmpty).toBe(true);
  });
});
