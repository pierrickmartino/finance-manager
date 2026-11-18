import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { createAccount } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { editClassification, splitTransaction } from '../transactions';
import { linkTransfer, transactionSide } from '../transfers';
import { createWidget, runWidget, type WidgetQueryInput } from '.';

const t = setupTestDatabase();

const OVER_TIME = {
  dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' },
  rows: 'month',
} as const satisfies WidgetQueryInput;

/**
 * A CHF current Account at BCGE and a EUR savings Account at UBS, both open since 2024, with a
 * Capital Category (Property) and an expense one (Groceries).
 */
async function setUp() {
  const bcge = await createBank(t.ctx, { name: 'BCGE' });
  const ubs = await createBank(t.ctx, { name: 'UBS' });
  const francs = await createAccount(t.ctx, {
    bankId: bcge.id,
    importFormat: null,
    kind: 'current',
    name: 'Francs',
    currency: 'CHF',
    openingBalanceMinor: 1_000_000,
    openingDate: '2024-01-01',
  });
  const euros = await createAccount(t.ctx, {
    bankId: ubs.id,
    importFormat: null,
    kind: 'savings',
    name: 'Euros',
    currency: 'EUR',
    openingBalanceMinor: 1_000_000,
    openingDate: '2024-01-01',
  });
  const capital = await createCategoryGroup(t.ctx, { name: 'Capital', type: 'capital' });
  const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  const property = await createCategory(t.ctx, { groupId: capital.id, name: 'Property' });
  const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
  await seedEurRates(t.ctx, [
    ['2024-12-31', '0.9400'],
    ['2025-02-10', '0.9500'],
  ]);
  return { bcge, ubs, francs, euros, property, groceries };
}

async function runNetWorth(query: WidgetQueryInput) {
  const widget = await createWidget(t.ctx, {
    name: 'Net worth',
    source: 'account_balances',
    query,
  });
  return runWidget(t.ctx, widget.id);
}

describe('Capital markers on Net worth over time', () => {
  it('marks a Capital Transaction at its date with its Payee and CHF amount', async () => {
    const { euros, property } = await setUp();
    const [deposit] = await seedTransactions(t.ctx.db, euros, [
      { bookingDate: '2025-02-15', amountMinor: -200_000 },
    ]);
    await editClassification(t.ctx, deposit!, {
      categoryId: property.id,
      payeeName: 'Notary Dupont',
    });

    const report = await runNetWorth(OVER_TIME);

    // −2000 EUR at the 2025-02-10 rate (0.95).
    expect(report.markers).toEqual([
      {
        transactionId: deposit,
        lineId: null,
        date: '2025-02-15',
        amountMinor: -190_000,
        label: 'Notary Dupont',
      },
    ]);
  });

  it("marks a Capital Split line with that line's own amount and its Category", async () => {
    const { francs, property, groceries } = await setUp();
    const [mixed] = await seedTransactions(t.ctx.db, francs, [
      { bookingDate: '2025-03-03', amountMinor: -150_000 },
    ]);
    const split = await splitTransaction(t.ctx, mixed!, [
      { amountMinor: -100_000, categoryId: property.id },
      { amountMinor: -50_000, categoryId: groceries.id },
    ]);

    const report = await runNetWorth(OVER_TIME);

    expect(report.markers).toEqual([
      {
        transactionId: mixed,
        lineId: split.splitLines[0]!.id,
        date: '2025-03-03',
        amountMinor: -100_000,
        label: 'Property',
      },
    ]);
  });

  it('gives no marker to non-Capital Transactions, Transfers or dates outside the range', async () => {
    const { francs, euros, property, groceries } = await setUp();
    const [food, early, out, into] = await seedTransactions(t.ctx.db, francs, [
      { bookingDate: '2025-01-20', amountMinor: -8_000 },
      { bookingDate: '2024-12-20', amountMinor: -500_000 },
      { bookingDate: '2025-02-01', amountMinor: -100_000 },
    ]).then(async (ids) => [
      ...ids,
      ...(await seedTransactions(t.ctx.db, euros, [
        { bookingDate: '2025-02-01', amountMinor: 95_000 },
      ])),
    ]);
    await editClassification(t.ctx, food!, { categoryId: groceries.id });
    await editClassification(t.ctx, early!, { categoryId: property.id });
    await editClassification(t.ctx, out!, { categoryId: property.id });
    await linkTransfer(t.ctx, { sides: [transactionSide(out!), transactionSide(into!)] });

    const report = await runNetWorth(OVER_TIME);

    expect(report.markers).toEqual([]);
  });

  it("follows the Widget's Account, Bank and Account kind filters", async () => {
    const { francs, euros, bcge, ubs, property } = await setUp();
    const [inFrancs] = await seedTransactions(t.ctx.db, francs, [
      { bookingDate: '2025-01-10', amountMinor: -300_000 },
    ]);
    const [inEuros] = await seedTransactions(t.ctx.db, euros, [
      { bookingDate: '2025-02-15', amountMinor: -200_000 },
    ]);
    await editClassification(t.ctx, inFrancs!, { categoryId: property.id });
    await editClassification(t.ctx, inEuros!, { categoryId: property.id });
    const markedIn = async (filters: WidgetQueryInput['filters']) =>
      (await runNetWorth({ ...OVER_TIME, filters })).markers!.map((m) => m.transactionId);

    expect(await markedIn({})).toEqual([inFrancs, inEuros]);
    expect(await markedIn({ accountIds: [euros.id] })).toEqual([inEuros]);
    expect(await markedIn({ bankIds: [bcge.id] })).toEqual([inFrancs]);
    expect(await markedIn({ bankIds: [ubs.id], accountKinds: ['current'] })).toEqual([]);
    expect(await markedIn({ accountKinds: ['savings'] })).toEqual([inEuros]);
  });

  it("doesn't change any point: Capital movements are already in the balances", async () => {
    const { francs, property } = await setUp();
    const [purchase] = await seedTransactions(t.ctx.db, francs, [
      { bookingDate: '2025-02-15', amountMinor: -300_000 },
    ]);
    const before = await runNetWorth(OVER_TIME);
    await editClassification(t.ctx, purchase!, { categoryId: property.id });

    const after = await runNetWorth(OVER_TIME);

    expect(after.markers).toHaveLength(1);
    expect(after.cells).toEqual(before.cells);
    expect(after.rowTotals).toEqual(before.rowTotals);
    // Francs 10,000 − 3,000 from February, Euros 10,000 EUR at each month's rate.
    expect(after.rowTotals).toEqual([1_000_000 + 940_000, 700_000 + 950_000, 700_000 + 950_000]);
  });
});
