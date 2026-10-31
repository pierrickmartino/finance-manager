import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { editClassification, type ClassificationChanges } from '../transactions';
import { linkTransfer } from '../transfers';
import { runWidgetQuery, type WidgetQueryInput } from '.';

const t = setupTestDatabase();

async function account(name: string, currency = 'CHF'): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `Bank ${name}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name,
    currency,
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

interface Row extends SeedTransaction {
  classify?: ClassificationChanges;
}

/** Seeds Transactions and classifies the ones that say how. Returns their ids in order. */
async function seed(on: Account, rows: Row[]): Promise<string[]> {
  const ids = await seedTransactions(t.ctx.db, on, rows);
  for (const [index, row] of rows.entries()) {
    if (row.classify) await editClassification(t.ctx, ids[index]!, row.classify);
  }
  return ids;
}

async function seedRates(rates: [currency: string, date: string, rate: string][]): Promise<void> {
  for (const [currency, date, rate] of rates) {
    await t.ctx.db.query('INSERT INTO fx_rate (currency, date, rate_to_chf) VALUES ($1, $2, $3)', [
      currency,
      date,
      rate,
    ]);
  }
}

/**
 * The reporting dataset, January to March 2025:
 * - UBS (CHF): salary, groceries and a groceries refund, a property purchase (Capital), a
 *   Transfer out to the EUR Account, and an unclassified Transaction.
 * - CA (EUR): groceries on a Saturday (converted at Friday's rate), a restaurant at a rate that
 *   rounds half away from zero, the Transfer's other side, and one before any EUR rate exists.
 */
async function dataset() {
  const income = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
  const food = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  const capital = await createCategoryGroup(t.ctx, { name: 'Capital', type: 'capital' });
  const salary = await createCategory(t.ctx, { groupId: income.id, name: 'Salary' });
  const groceries = await createCategory(t.ctx, { groupId: food.id, name: 'Groceries' });
  const restaurants = await createCategory(t.ctx, { groupId: food.id, name: 'Restaurants' });
  const property = await createCategory(t.ctx, { groupId: capital.id, name: 'Property' });
  const as = (category: Category, more: ClassificationChanges = {}): ClassificationChanges => ({
    categoryId: category.id,
    ...more,
  });

  const ubs = await account('UBS');
  const ca = await account('CA', 'EUR');
  await seedRates([
    ['EUR', '2025-01-10', '0.9400'],
    ['EUR', '2025-01-13', '0.9500'],
    ['EUR', '2025-02-10', '0.9301'],
    ['EUR', '2025-02-21', '0.9400'],
  ]);

  const [, , , , , transferOut] = await seed(ubs, [
    {
      bookingDate: '2025-01-25',
      amountMinor: 600000,
      classify: as(salary, { payeeName: 'Employer', tagNames: ['Work'] }),
    },
    {
      bookingDate: '2025-01-10',
      amountMinor: -12000,
      classify: as(groceries, { payeeName: 'Migros', tagNames: ['Family', 'Weekly'] }),
    },
    { bookingDate: '2025-01-20', amountMinor: 2000, classify: as(groceries, { payeeName: 'Migros' }) },
    {
      bookingDate: '2025-02-03',
      amountMinor: -8000,
      classify: as(groceries, { payeeName: 'Coop', tagNames: ['Family'] }),
    },
    { bookingDate: '2025-02-15', amountMinor: -5000000, classify: as(property) },
    { bookingDate: '2025-02-20', amountMinor: -100000 },
    { bookingDate: '2025-03-01', amountMinor: -3000 },
  ]);
  const [, , transferIn] = await seed(ca, [
    { bookingDate: '2025-01-11', amountMinor: -10000, classify: as(groceries) },
    { bookingDate: '2025-02-10', amountMinor: -5000, classify: as(restaurants) },
    { bookingDate: '2025-02-22', amountMinor: 106000 },
    { bookingDate: '2025-01-05', amountMinor: -777 },
  ]);
  await linkTransfer(t.ctx, { transactionIds: [transferOut!, transferIn!] });

  return { ubs, ca, income, food, capital, salary, groceries, restaurants, property };
}

const Q1_2025 = { kind: 'fixed', from: '2025-01-01', to: '2025-03-31' } as const;

const keys = (headers: { key: string | null }[]) => headers.map((header) => header.key);
const labels = (headers: { label: string }[]) => headers.map((header) => header.label);

describe('run a Widget query', () => {
  it('builds a month × Category table in CHF with row, column and grand totals', async () => {
    const { salary, groceries, restaurants } = await dataset();

    const report = await runWidgetQuery(t.ctx, {
      dateRange: Q1_2025,
      rows: 'month',
      columns: 'category',
      measure: 'sum',
    });

    expect(keys(report.rows)).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(keys(report.columns)).toEqual([salary.id, groceries.id, restaurants.id, null]);
    expect(labels(report.columns)).toEqual([
      'Income › Salary',
      'Food › Groceries',
      'Food › Restaurants',
      'Unclassified',
    ]);
    // Groceries in January: -120.00 + 20.00 refund + EUR -100.00 at Friday's 0.94 = -194.00.
    // Restaurants: EUR -50.00 × 0.9301 = -46.505, rounded half away from zero to -46.51.
    // The Transfer and the Capital purchase appear nowhere.
    expect(report.cells).toEqual([
      [600000, -19400, null, null],
      [null, -8000, -4651, null],
      [null, null, null, -3000],
    ]);
    expect(report.rowTotals).toEqual([580600, -12651, -3000]);
    expect(report.columnTotals).toEqual([600000, -27400, -4651, -3000]);
    expect(report.total).toBe(564949);
  });

  it('leaves out, and counts, Transactions whose Currency has no rate yet', async () => {
    await dataset();

    const report = await runWidgetQuery(t.ctx, { dateRange: Q1_2025 });

    // The EUR Transaction of 2025-01-05 predates the first EUR rate: it is never counted as 0.
    expect(report.unconvertedCount).toBe(1);
    expect(report.total).toBe(564949);
  });
});
