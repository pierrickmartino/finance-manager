import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { archiveAccount, createAccount } from '../accounts';
import { listAccountBalances } from '../accounts/balances';
import { recordBalanceSnapshot } from '../balance-snapshots';
import { createBank } from '../banks';
import { createWidget, runWidget, type WidgetQueryInput } from '.';

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

const RATES = [
  ['2024-12-31', '0.9400'],
  ['2025-02-28', '0.9500'],
  ['2025-03-31', '0.9300'],
] as const;

/**
 * Three Accounts: Francs opens mid-January 2025 and has Transactions, Euros (archived, still
 * holding money) opens in December 2024 and never moves, and a snapshot-only loan opens on
 * 1 January 2025 and is recorded once, at the end of February.
 */
async function setUpAccounts() {
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
  await seedEurRates(t.ctx, RATES);
  return { francs, euros, loan };
}

async function runNetWorth(query: WidgetQueryInput) {
  const widget = await createWidget(t.ctx, {
    name: 'Net worth',
    source: 'account_balances',
    query,
  });
  return runWidget(t.ctx, widget.id);
}

const points = (report: Awaited<ReturnType<typeof runNetWorth>>) =>
  report.rows.map((row, r) => [row.key, report.cells[r]![0]]);

describe('Net worth over time (a balances Widget with a time axis)', () => {
  it('gives each month the Net worth in CHF at its last day', async () => {
    await setUpAccounts();

    const report = await runNetWorth({
      dateRange: { kind: 'fixed', from: '2024-12-01', to: '2025-04-30' },
      rows: 'month',
    });

    // Dec: only Euros is open (1000 EUR at 0.94). Jan: Francs opens, the loan at its opening
    // balance. Feb: Francs +200, the loan's snapshot, EUR at 0.95. Mar: Francs −50, EUR at
    // 0.93. Apr: no new data, every Account held flat.
    expect(points(report)).toEqual([
      ['2024-12', 94_000],
      ['2025-01', 100_000 + 94_000 - 300_000],
      ['2025-02', 120_000 + 95_000 - 250_000],
      ['2025-03', 115_000 + 93_000 - 250_000],
      ['2025-04', 115_000 + 93_000 - 250_000],
    ]);
    expect(report).toMatchObject({
      query: { rows: 'month', columns: null, measure: 'sum' },
      range: { from: '2024-12-01', to: '2025-04-30' },
      partialPeriod: null,
      columns: [{ key: null, label: 'Net worth in CHF', isPartial: false }],
      // A stock: the range's Net worth is its latest point's, not the sum of the points.
      total: -42_000,
      columnTotals: [-42_000],
      unconvertedCount: 0,
    });
    expect(report.rows[0]).toEqual({ key: '2024-12', label: 'Dec 2024', isPartial: false });
    expect(report.rowTotals).toEqual(report.cells.map((row) => row[0]));
  });

  it('adds up, at each point, every Account balance the Accounts page shows for that day', async () => {
    const accounts = await setUpAccounts();
    const ids = new Set(Object.values(accounts).map((account) => account.id));

    const report = await runNetWorth({
      dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' },
      rows: 'month',
    });

    for (const [r, date] of ['2025-01-31', '2025-02-28', '2025-03-31'].entries()) {
      const balances = await listAccountBalances(t.ctx, { date });
      const expected = balances
        .filter((balance) => ids.has(balance.account.id))
        .reduce((sum, balance) => sum + (balance.chf?.amountMinor ?? 0), 0);
      expect(report.cells[r]![0]).toBe(expected);
    }
  });

  it('revalues a EUR Account at each point, so a point moves when only the rate changes', async () => {
    const bank = await createBank(t.ctx, { name: 'BCGE' });
    await createAccount(t.ctx, {
      bankId: bank.id,
      importFormat: null,
      kind: 'savings',
      name: 'Euros',
      currency: 'EUR',
      openingBalanceMinor: 100_000,
      openingDate: '2024-01-01',
    });
    await seedEurRates(t.ctx, RATES);

    const report = await runNetWorth({
      dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' },
      rows: 'month',
    });

    expect(report.cells).toEqual([[94_000], [95_000], [93_000]]);
  });

  it('values quarter and year points at the last day of their period', async () => {
    await setUpAccounts();

    const quarters = await runNetWorth({
      dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-06-30' },
      rows: 'quarter',
    });
    const years = await runNetWorth({
      dateRange: { kind: 'fixed', from: '2024-01-01', to: '2025-12-31' },
      rows: 'year',
    });

    expect(points(quarters)).toEqual([
      ['2025-Q1', -42_000],
      ['2025-Q2', -42_000],
    ]);
    expect(points(years)).toEqual([
      ['2024', 94_000],
      ['2025', -42_000],
    ]);
  });

  it('values the current period at today when the range includes it', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2025-03-20T09:00:00Z') });
    await setUpAccounts();

    const report = await runNetWorth({
      dateRange: { kind: 'last', count: 1, unit: 'month', includeCurrent: true },
      rows: 'month',
    });

    expect(report.rows.map((row) => [row.key, row.isPartial])).toEqual([
      ['2025-02', false],
      ['2025-03', true],
    ]);
    // On 20 March: Francs after its 5 March Transaction, EUR at the 28 February rate.
    expect(report.cells.at(-1)).toEqual([115_000 + 95_000 - 250_000]);
  });

  it('leaves out and counts an Account with no FX rate for its balance', async () => {
    const bank = await createBank(t.ctx, { name: 'BCGE' });
    const base = { bankId: bank.id, importFormat: null, kind: 'current' as const };
    await createAccount(t.ctx, {
      ...base,
      name: 'Euros',
      currency: 'EUR',
      openingBalanceMinor: 100_000,
      openingDate: '2024-01-01',
    });
    await createAccount(t.ctx, {
      ...base,
      name: 'Francs',
      currency: 'CHF',
      openingBalanceMinor: 50_000,
      openingDate: '2024-01-01',
    });

    const report = await runNetWorth({
      dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-02-28' },
      rows: 'month',
    });

    expect(report.cells).toEqual([[50_000], [50_000]]);
    expect(report.unconvertedCount).toBe(1);
  });
});

describe('a balances Widget with no time axis', () => {
  it('returns the Account balances today, exactly as before', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2025-03-20T09:00:00Z') });
    const { francs, euros, loan } = await setUpAccounts();

    const report = await runNetWorth({
      dateRange: { kind: 'last', count: 12, unit: 'month' },
      rows: 'account',
      columns: null,
    });

    expect(report).toEqual({
      query: {
        filters: {},
        dateRange: { kind: 'last', count: 12, unit: 'month', includeCurrent: false },
        rows: 'account',
        columns: null,
        measure: 'sum',
        averagePer: 'month',
        includeCapital: false,
      },
      range: { from: '2025-03-20', to: '2025-03-20' },
      partialPeriod: null,
      rows: [
        { key: francs.id, label: 'BCGE · Francs', isPartial: false },
        { key: loan.id, label: 'BCGE · Mortgage', isPartial: false },
        { key: euros.id, label: 'BCGE · Euros', isPartial: false },
      ],
      columns: [{ key: null, label: 'Balance in CHF', isPartial: false }],
      cells: [[115_000], [-250_000], [95_000]],
      rowTotals: [115_000, -250_000, 95_000],
      columnTotals: [-40_000],
      total: -40_000,
      unconvertedCount: 0,
    });
  });
});
