import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixToday, seedEarlyStart } from '@test/support/analytics';
import { MONTHLY, QUARTERLY, YEARLY } from '@test/support/periods';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { archiveAccount, createAccount } from '../accounts';
import { recordBalanceSnapshot } from '../balance-snapshots';
import { createBank } from '../banks';
import { presetPeriod, type Period } from '@/lib/analytics/period';
import type { ReportTable } from '../reporting';
import { swissToday } from '../fx/dates';
import { loadDataStart } from './data-start';
import { netWorthTrend } from './net-worth';
import { readingOf } from './reading';

/** Analytics' Net worth trend (spec #170): the Key figures' Net worth tile's sparkline. */

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
  await seedEarlyStart(t.ctx, francs);
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

/** The trend over a Period read today, cut to the first Transaction as the Analytics page does. */
async function trendOf(period: Period): Promise<ReportTable> {
  const { firstTransaction } = await loadDataStart(t.ctx);
  return netWorthTrend(t.ctx, readingOf(period, swissToday(), firstTransaction));
}

const dated = (trend: ReportTable) =>
  trend.rows.map((row, r) => [row.label, trend.rowTotals[r], row.isPartial]);

describe('Net worth trend', () => {
  it("by month, has a point at the Period's start, each month end and today", async () => {
    fixToday('2025-03-20');
    await dataset();

    const trend = await trendOf(MONTHLY);

    // Last 12 months starts on 21 Mar 2024: the start, labelled with that day, reads the end
    // of 20 March, before any Account.
    expect(dated(trend).slice(0, 2)).toEqual([
      ['21 Mar 2024', 0, false],
      ['Mar 2024', 0, false],
    ]);
    expect(dated(trend).slice(10)).toEqual([
      ['Dec 2024', END_OF_2024, false],
      // January: Francs at its opening, the Mortgage at its opening.
      ['Jan 2025', 100_000 + 94_000 - 300_000, false],
      ['Feb 2025', 120_000 + 95_000 - 250_000, false],
      ['Mar 2025', TODAY, true],
    ]);
    expect(trend.rows).toHaveLength(14);
    expect(trend.unconvertedCount).toBe(0);
  });

  it("from mid-month, starts at the Period's first day, reading the day before's end", async () => {
    fixToday('2025-03-20');
    await dataset();

    const trend = await trendOf({ kind: 'custom', from: '2025-02-15' });

    // 14 February: Francs after its February gain, Euros at 0.94, the Mortgage at its opening.
    expect(dated(trend)).toEqual([
      ['15 Feb 2025', 120_000 + 94_000 - 300_000, false],
      ['Feb 2025', 120_000 + 95_000 - 250_000, false],
      ['Mar 2025', TODAY, true],
    ]);
  });

  it("by quarter and by year, has a point at the Period's start and each interval end", async () => {
    fixToday('2025-03-20');
    await dataset();

    const quarterly = await trendOf(QUARTERLY);
    const yearly = await trendOf(YEARLY);

    expect(quarterly.rows.map((row) => row.label)).toEqual([
      '1 Jan 2024',
      'Q1 2024',
      'Q2 2024',
      'Q3 2024',
      'Q4 2024',
      'Q1 2025',
    ]);
    expect(quarterly.rowTotals.at(-1)).toBe(TODAY);
    expect(yearly.rows.map((row) => row.label)).toEqual([
      '1 Jan 2021',
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
    ]);
    expect(yearly.rowTotals).toEqual([0, 0, 0, 0, END_OF_2024, TODAY]);
  });

  it('over Year to date, starts at the end of last year', async () => {
    fixToday('2025-03-20');
    await dataset();

    const trend = await trendOf(presetPeriod('year-to-date'));

    expect(dated(trend)).toEqual([
      ['1 Jan 2025', END_OF_2024, false],
      ['Jan 2025', 100_000 + 94_000 - 300_000, false],
      ['Feb 2025', 120_000 + 95_000 - 250_000, false],
      ['Mar 2025', TODAY, true],
    ]);
  });

  it("over a single interval, still has two points: the Period's start, then today", async () => {
    fixToday('2025-03-20');
    await dataset();

    const trend = await trendOf({ kind: 'custom', from: '2025-03-01' });

    expect(dated(trend)).toEqual([
      ['1 Mar 2025', 120_000 + 95_000 - 250_000, false],
      ['Mar 2025', TODAY, true],
    ]);
  });
});
