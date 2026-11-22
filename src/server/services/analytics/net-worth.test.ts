import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection } from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/spans';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { archiveAccount, createAccount } from '../accounts';
import { recordBalanceSnapshot } from '../balance-snapshots';
import { createBank } from '../banks';
import type { Span } from '@/lib/analytics/span';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { readHeadlineTrend } from '@/lib/reporting/net-worth-headline';
import { headlineAmount } from '@/lib/reporting/overview';
import type { TimeAxis } from '../reporting/query';

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

/** What the Dashboard's Net worth card heads with, read from the section as it reads a Story. */
async function headlineAt(span: Span, grain: TimeAxis) {
  const netWorth = await loadSection(t.ctx, span, 'netWorth');
  return {
    netWorth,
    hero: headlineAmount(netWorth.cards, readHeadlineTrend(netWorth.trend, grain)),
  };
}

const dated = (trend: ChartSource) =>
  trend.rows.map((row, r) => [row.label, trend.rowTotals[r], trend.hrefs.rowTotals[r]]);

describe('Net worth', () => {
  it('by month, has a point at each month end of the Span and today, each opening the Accounts then', async () => {
    fixToday('2025-03-20');
    await dataset();

    const { netWorth, hero } = await headlineAt(MONTHLY, 'month');

    expect(hero).toMatchObject({ label: 'Your net worth today', value: TODAY, href: '/accounts' });
    expect(dated(netWorth.trend).slice(9)).toEqual([
      ['Dec 2024', END_OF_2024, '/accounts?date=2024-12-31'],
      // January: Francs at its opening, the Mortgage at its opening.
      ['Jan 2025', 100_000 + 94_000 - 300_000, '/accounts?date=2025-01-31'],
      ['Feb 2025', 120_000 + 95_000 - 250_000, '/accounts?date=2025-02-28'],
      ['Mar 2025', TODAY, '/accounts?date=2025-03-20'],
    ]);
    expect(netWorth.trend.rows).toHaveLength(13);
    expect(netWorth.trend.rows.at(-1)?.isPartial).toBe(true);
    // The line starts at the first month with any Net worth.
    expect(hero?.trend?.points.map((point) => point.label)).toEqual([
      'Dec 2024',
      'Jan 2025',
      'Feb 2025',
      'Mar 2025',
    ]);
    // Francs lost 50.00 since the end of February; nothing else moved.
    expect(hero?.trend?.changes).toEqual([
      {
        label: '1M',
        months: 1,
        since: 'Feb 2025',
        change: -5_000,
        href: '/accounts?date=2025-02-28',
      },
    ]);
    expect(netWorth.unconvertedCount).toBe(0);
  });

  it('by quarter, has a point at each quarter end of the Span and today, its change since Q4', async () => {
    fixToday('2025-03-20');
    await dataset();

    const { netWorth, hero } = await headlineAt(QUARTERLY, 'quarter');

    expect(hero?.value).toBe(TODAY);
    expect(netWorth.trend.hrefs.rowTotals).toEqual([
      ...['2024-03-31', '2024-06-30', '2024-09-30'].map((date) => `/accounts?date=${date}`),
      '/accounts?date=2024-12-31',
      '/accounts?date=2025-03-20',
    ]);
    expect(hero?.trend?.changes).toEqual([
      {
        label: '1Q',
        months: 3,
        since: 'Q4 2024',
        change: TODAY - END_OF_2024,
        href: '/accounts?date=2024-12-31',
      },
    ]);
  });

  it('by year, has a point at each year end of the Span and today, its change since 2024', async () => {
    fixToday('2025-03-20');
    await dataset();

    const { netWorth, hero } = await headlineAt(YEARLY, 'year');

    expect(netWorth.trend.rowTotals).toEqual([0, 0, 0, END_OF_2024, TODAY]);
    expect(hero?.trend?.changes).toEqual([
      {
        label: '1Y',
        months: 12,
        since: '2024',
        change: TODAY - END_OF_2024,
        href: '/accounts?date=2024-12-31',
      },
    ]);
  });

  it("breaks down the Span's income and expense with the Account balances, as the Dashboard's card does", async () => {
    fixToday('2025-03-20');
    await dataset();

    const { netWorth } = await headlineAt(MONTHLY, 'month');

    expect(netWorth.cards.map((card) => card.name)).toEqual([
      'Account balances in CHF',
      'Spending Insights',
    ]);
  });

  it('has nothing to show without an Account', async () => {
    fixToday('2025-03-20');

    const { netWorth, hero } = await headlineAt(MONTHLY, 'month');

    expect(netWorth.isEmpty).toBe(true);
    expect(hero).toBeNull();
  });
});
