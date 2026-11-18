import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createWidget, runWidget, type WidgetQueryInput } from '.';

const t = setupTestDatabase();

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Four CHF Accounts, all open since 2024, never moving: at BCGE a current Account (1000) and
 * a savings Account (500), at UBS a 3a (300) and a loan (−2000).
 */
async function setUpAccounts() {
  const bcge = await createBank(t.ctx, { name: 'BCGE' });
  const ubs = await createBank(t.ctx, { name: 'UBS' });
  const account = (
    bankId: string,
    kind: 'current' | 'savings' | '3a' | 'loan',
    name: string,
    openingBalanceMinor: number,
  ) =>
    createAccount(t.ctx, {
      bankId,
      importFormat: null,
      kind,
      name,
      currency: 'CHF',
      openingBalanceMinor,
      openingDate: '2024-01-01',
    });
  const current = await account(bcge.id, 'current', 'Current', 100_000);
  const savings = await account(bcge.id, 'savings', 'Savings', 50_000);
  const pillar = await account(ubs.id, '3a', 'Pillar', 30_000);
  const loan = await account(ubs.id, 'loan', 'Mortgage', -200_000);
  return { bcge, ubs, current, savings, pillar, loan };
}

const OVER_TIME = {
  dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-02-28' },
  rows: 'month',
} as const satisfies WidgetQueryInput;

const ON_ONE_DATE = {
  dateRange: { kind: 'last', count: 12, unit: 'month' },
  rows: 'account',
  columns: null,
} as const satisfies WidgetQueryInput;

async function runBalances(query: WidgetQueryInput) {
  const widget = await createWidget(t.ctx, {
    name: 'Balances',
    source: 'account_balances',
    query,
  });
  return runWidget(t.ctx, widget.id);
}

describe('Account filters on a balances Widget', () => {
  it('counts only the chosen Accounts at every point over time', async () => {
    const { current, pillar } = await setUpAccounts();

    const report = await runBalances({
      ...OVER_TIME,
      filters: { accountIds: [current.id, pillar.id] },
    });

    expect(report.rowTotals).toEqual([130_000, 130_000]);
    expect(report.total).toBe(130_000);
  });

  it('lists and totals only the chosen Accounts on one date', async () => {
    const { current, pillar } = await setUpAccounts();

    const report = await runBalances({
      ...ON_ONE_DATE,
      filters: { accountIds: [current.id, pillar.id] },
    });

    expect(report.rows.map((row) => row.key).sort()).toEqual([current.id, pillar.id].sort());
    expect(report.total).toBe(130_000);
  });

  it('counts only the Accounts of the chosen Banks', async () => {
    const { ubs, pillar, loan } = await setUpAccounts();

    const overTime = await runBalances({ ...OVER_TIME, filters: { bankIds: [ubs.id] } });
    const onOneDate = await runBalances({ ...ON_ONE_DATE, filters: { bankIds: [ubs.id] } });

    expect(overTime.rowTotals).toEqual([-170_000, -170_000]);
    expect(onOneDate.rows.map((row) => row.key).sort()).toEqual([pillar.id, loan.id].sort());
    expect(onOneDate.total).toBe(-170_000);
  });

  it('counts only the Accounts of the chosen kinds', async () => {
    const { savings, pillar } = await setUpAccounts();
    const filters = { accountKinds: ['savings' as const, '3a' as const] };

    const overTime = await runBalances({ ...OVER_TIME, filters });
    const onOneDate = await runBalances({ ...ON_ONE_DATE, filters });

    expect(overTime.rowTotals).toEqual([80_000, 80_000]);
    expect(onOneDate.rows.map((row) => row.key).sort()).toEqual([savings.id, pillar.id].sort());
    expect(onOneDate.total).toBe(80_000);
  });

  it('counts an Account only when it passes every filter', async () => {
    const { bcge, current, pillar } = await setUpAccounts();

    const report = await runBalances({
      ...ON_ONE_DATE,
      filters: {
        accountIds: [current.id, pillar.id],
        bankIds: [bcge.id],
        accountKinds: ['current', '3a'],
      },
    });

    expect(report.rows.map((row) => row.key)).toEqual([current.id]);
  });

  it('has no rows and no total when the filters leave no Account', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2025-03-20T09:00:00Z') });
    const { bcge } = await setUpAccounts();
    const filters = { bankIds: [bcge.id], accountKinds: ['loan' as const] };

    const overTime = await runBalances({ ...OVER_TIME, filters });
    const onOneDate = await runBalances({ ...ON_ONE_DATE, filters });

    for (const report of [overTime, onOneDate]) {
      expect(report).toMatchObject({ rows: [], cells: [], rowTotals: [], total: null });
    }
    expect(overTime.range).toEqual({ from: '2025-01-01', to: '2025-02-28' });
    expect(onOneDate.range).toEqual({ from: '2025-03-20', to: '2025-03-20' });
  });

  it('ignores Category, Payee, Tag, group type and Currency filters', async () => {
    await setUpAccounts();
    const classification = {
      categoryGroupIds: [randomUUID()],
      categoryIds: [randomUUID()],
      payeeIds: [randomUUID()],
      tagIds: [randomUUID()],
      categoryGroupTypes: ['income' as const],
      currencies: ['EUR'],
    };

    for (const query of [OVER_TIME, ON_ONE_DATE]) {
      const unfiltered = await runBalances(query);
      const classified = await runBalances({
        ...query,
        filters: classification,
        includeCapital: true,
      });

      expect(classified.rows).toEqual(unfiltered.rows);
      expect(classified.cells).toEqual(unfiltered.cells);
      expect(classified.total).toBe(unfiltered.total);
    }
  });
});
