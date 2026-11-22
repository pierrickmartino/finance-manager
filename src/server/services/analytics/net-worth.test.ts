import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, loadSection } from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/spans';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { archiveAccount, createAccount } from '../accounts';
import { recordBalanceSnapshot } from '../balance-snapshots';
import { createBank } from '../banks';
import { presetSpan, type Span } from '@/lib/analytics/span';
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
  it("by month, has a point at the Span's start, each month end and today, each opening the Accounts then", async () => {
    fixToday('2025-03-20');
    await dataset();

    const { netWorth, hero } = await headlineAt(MONTHLY, 'month');

    expect(hero).toMatchObject({ label: 'Your net worth today', value: TODAY, href: '/accounts' });
    // Rolling 12 months starts on 21 Mar 2024: the start is the end of 20 March, before any Account.
    expect(dated(netWorth.trend).slice(0, 2)).toEqual([
      ['20 Mar 2024', 0, '/accounts?date=2024-03-20'],
      ['Mar 2024', 0, '/accounts?date=2024-03-31'],
    ]);
    expect(dated(netWorth.trend).slice(10)).toEqual([
      ['Dec 2024', END_OF_2024, '/accounts?date=2024-12-31'],
      // January: Francs at its opening, the Mortgage at its opening.
      ['Jan 2025', 100_000 + 94_000 - 300_000, '/accounts?date=2025-01-31'],
      ['Feb 2025', 120_000 + 95_000 - 250_000, '/accounts?date=2025-02-28'],
      ['Mar 2025', TODAY, '/accounts?date=2025-03-20'],
    ]);
    // The start, then one point per month of the Span.
    expect(netWorth.trend.rows).toHaveLength(14);
    expect(netWorth.trend.rows.at(-1)?.isPartial).toBe(true);
    expect(netWorth.change).toEqual({
      since: '20 Mar 2024',
      change: TODAY,
      href: '/accounts?date=2024-03-20',
    });
    expect(netWorth.unconvertedCount).toBe(0);
  });

  it("by month from mid-month, starts the line on the day before the Span's first, its change since then", async () => {
    fixToday('2025-03-20');
    await dataset();

    // From mid-February, after the first Transaction (10 Feb), so the Span is not clamped.
    const netWorth = await loadSection(t.ctx, { kind: 'custom', from: '2025-02-15' }, 'netWorth');

    // 14 February: Francs after its February gain, Euros at 0.94, the Mortgage at its opening.
    const START = 120_000 + 94_000 - 300_000;
    expect(dated(netWorth.trend)).toEqual([
      ['14 Feb 2025', START, '/accounts?date=2025-02-14'],
      ['Feb 2025', 120_000 + 95_000 - 250_000, '/accounts?date=2025-02-28'],
      ['Mar 2025', TODAY, '/accounts?date=2025-03-20'],
    ]);
    expect(netWorth.change).toEqual({
      since: '14 Feb 2025',
      change: TODAY - START,
      href: '/accounts?date=2025-02-14',
    });
  });

  it("by quarter, has a point at the Span's start, each quarter end and today, its change since the start", async () => {
    fixToday('2025-03-20');
    await dataset();

    const { netWorth, hero } = await headlineAt(QUARTERLY, 'quarter');

    expect(hero?.value).toBe(TODAY);
    expect(netWorth.trend.rows.map((row) => row.label)).toEqual([
      '31 Dec 2023',
      'Q1 2024',
      'Q2 2024',
      'Q3 2024',
      'Q4 2024',
      'Q1 2025',
    ]);
    expect(netWorth.trend.hrefs.rowTotals).toEqual(
      ['2023-12-31', '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31', '2025-03-20'].map(
        (date) => `/accounts?date=${date}`,
      ),
    );
    expect(netWorth.change).toEqual({
      since: '31 Dec 2023',
      change: TODAY,
      href: '/accounts?date=2023-12-31',
    });
  });

  it("by year, has a point at the Span's start, each year end and today, its change since the start", async () => {
    fixToday('2025-03-20');
    await dataset();

    const { netWorth } = await headlineAt(YEARLY, 'year');

    expect(netWorth.trend.rows.map((row) => row.label)).toEqual([
      '31 Dec 2020',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
    ]);
    expect(netWorth.trend.rowTotals).toEqual([0, 0, 0, 0, END_OF_2024, TODAY]);
    expect(netWorth.change?.change).toBe(TODAY);
  });

  it('over Year to date, reads its change against the end of last year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const netWorth = await loadSection(t.ctx, presetSpan('year-to-date'), 'netWorth');

    expect(dated(netWorth.trend)).toEqual([
      ['31 Dec 2024', END_OF_2024, '/accounts?date=2024-12-31'],
      ['Jan 2025', 100_000 + 94_000 - 300_000, '/accounts?date=2025-01-31'],
      ['Feb 2025', 120_000 + 95_000 - 250_000, '/accounts?date=2025-02-28'],
      ['Mar 2025', TODAY, '/accounts?date=2025-03-20'],
    ]);
    expect(netWorth.change?.change).toBe(TODAY - END_OF_2024);
  });

  it('reads the Account balances of today, whatever the Span', async () => {
    fixToday('2025-03-20');
    await dataset();

    const spans: Span[] = [MONTHLY, QUARTERLY, YEARLY, { kind: 'custom', from: '2025-03-01' }];
    const balances = await Promise.all(
      spans.map(async (span) => (await loadSection(t.ctx, span, 'netWorth')).cards[0]),
    );

    for (const card of balances) expect(card).toEqual(balances[0]);
    expect(balances[0]?.data?.total).toBe(TODAY);
  });

  it("over a single period, still draws a line: the Span's start, then today, its change since the start", async () => {
    fixToday('2025-03-20');
    await dataset();

    const netWorth = await loadSection(t.ctx, { kind: 'custom', from: '2025-03-01' }, 'netWorth');

    // The start stands just before the Span's first day: Net worth at the end of February.
    const START = 120_000 + 95_000 - 250_000;
    expect(dated(netWorth.trend)).toEqual([
      ['28 Feb 2025', START, '/accounts?date=2025-02-28'],
      ['Mar 2025', TODAY, '/accounts?date=2025-03-20'],
    ]);
    expect(netWorth.trend.rows.map((row) => row.isPartial)).toEqual([false, true]);
    expect(netWorth.change).toEqual({
      since: '28 Feb 2025',
      change: TODAY - START,
      href: '/accounts?date=2025-02-28',
    });
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
