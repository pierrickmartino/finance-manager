import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { editClassification, type ClassificationChanges } from '../transactions';
import { linkTransfer } from '../transfers';
import { listCellTransactions, runWidgetQuery, type CellRef, type WidgetQueryInput } from '.';

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
    {
      bookingDate: '2025-01-20',
      amountMinor: 2000,
      classify: as(groceries, { payeeName: 'Migros' }),
    },
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
    expect(labels(report.rows)).toEqual(['Jan 2025', 'Feb 2025', 'Mar 2025']);
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

describe('income, expense, Capital and Transfers', () => {
  it('splits income and expense by Category group type, without Capital or Transfers', async () => {
    await dataset();

    const report = await runWidgetQuery(t.ctx, {
      dateRange: Q1_2025,
      rows: 'month',
      columns: 'categoryGroupType',
    });

    expect(keys(report.columns)).toEqual(['income', 'expense', null]);
    expect(labels(report.columns)).toEqual(['Income', 'Expense', 'Unclassified']);
    expect(report.cells).toEqual([
      [600000, -19400, null],
      [null, -12651, null],
      [null, null, -3000],
    ]);
  });

  it('includes Capital in net cash flow, but never Transfers', async () => {
    await dataset();

    const report = await runWidgetQuery(t.ctx, {
      dateRange: Q1_2025,
      rows: 'month',
      includeCapital: true,
    });

    // February: groceries -80.00, restaurant -46.51 and the property purchase -50 000.00.
    // The Transfer (-1 000.00 out, EUR 1 060.00 in) still counts on neither side.
    expect(report.cells).toEqual([[580600], [-5012651], [-3000]]);
    expect(report.total).toBe(-4435051);
  });

  it('reports Capital alone when filtered on the Capital type', async () => {
    const { property } = await dataset();

    const report = await runWidgetQuery(t.ctx, {
      dateRange: Q1_2025,
      columns: 'category',
      filters: { categoryGroupTypes: ['capital'] },
    });

    expect(keys(report.columns)).toEqual([property.id]);
    expect(report.total).toBe(-5000000);
  });
});

describe('axes', () => {
  it('groups by quarter and year, listing every period of the range', async () => {
    await dataset();

    const quarters = await runWidgetQuery(t.ctx, {
      dateRange: { kind: 'fixed', from: '2024-11-15', to: '2025-04-30' },
      rows: 'quarter',
    });
    const years = await runWidgetQuery(t.ctx, {
      dateRange: { kind: 'fixed', from: '2024-11-15', to: '2025-04-30' },
      rows: 'year',
    });

    expect(keys(quarters.rows)).toEqual(['2024-Q4', '2025-Q1', '2025-Q2']);
    expect(quarters.rows.map((row) => row.label)).toEqual(['Q4 2024', 'Q1 2025', 'Q2 2025']);
    expect(quarters.cells).toEqual([[null], [564949], [null]]);
    expect(keys(years.rows)).toEqual(['2024', '2025']);
    expect(years.rows.map((row) => row.label)).toEqual(['2024', '2025']);
    expect(years.cells).toEqual([[null], [564949]]);
  });

  it('groups by Category group, Account and Currency', async () => {
    const { ubs, ca, income, food } = await dataset();

    const groups = await runWidgetQuery(t.ctx, { dateRange: Q1_2025, rows: 'categoryGroup' });
    const accounts = await runWidgetQuery(t.ctx, {
      dateRange: Q1_2025,
      rows: 'account',
      columns: 'currency',
    });

    expect(keys(groups.rows)).toEqual([income.id, food.id, null]);
    expect(groups.cells).toEqual([[600000], [-32051], [-3000]]);
    expect(keys(accounts.rows)).toEqual([ca.id, ubs.id]);
    expect(labels(accounts.rows)).toEqual(['Bank CA · CA', 'Bank UBS · UBS']);
    expect(keys(accounts.columns)).toEqual(['CHF', 'EUR']);
    expect(accounts.cells).toEqual([
      [null, -14051],
      [579000, null],
    ]);
  });

  it('groups by Payee, with Transactions without a Payee last', async () => {
    await dataset();

    const report = await runWidgetQuery(t.ctx, { dateRange: Q1_2025, rows: 'payee' });

    expect(labels(report.rows)).toEqual(['Coop', 'Employer', 'Migros', 'No Payee']);
    expect(report.cells).toEqual([[-8000], [600000], [-10000], [-17051]]);
  });

  it('counts a Transaction under each of its Tags, but once in the totals', async () => {
    await dataset();

    const report = await runWidgetQuery(t.ctx, {
      dateRange: Q1_2025,
      rows: 'tag',
      columns: 'month',
    });

    expect(labels(report.rows)).toEqual(['Family', 'Weekly', 'Work', 'No Tag']);
    expect(report.cells).toEqual([
      [-12000, -8000, null],
      [-12000, null, null],
      [600000, null, null],
      [-7400, -4651, -3000],
    ]);
    // January: 6 000.00 - 120.00 + 20.00 - 94.00, with the Family+Weekly groceries once.
    expect(report.columnTotals).toEqual([580600, -12651, -3000]);
    expect(report.total).toBe(564949);
  });

  it('refuses the same axis on rows and columns', async () => {
    await expect(
      runWidgetQuery(t.ctx, { dateRange: Q1_2025, rows: 'month', columns: 'month' }),
    ).rejects.toThrow('Rows and columns must use different axes');
  });
});

describe('measures', () => {
  it('counts Transactions', async () => {
    const { groceries } = await dataset();

    const report = await runWidgetQuery(t.ctx, {
      dateRange: Q1_2025,
      rows: 'month',
      columns: 'category',
      measure: 'count',
      filters: { categoryIds: [groceries.id] },
    });

    expect(report.cells).toEqual([[3], [1], [null]]);
    expect(report.total).toBe(4);
  });

  it('averages per month over the range, and per month within each period', async () => {
    const { food } = await dataset();

    const byGroup = await runWidgetQuery(t.ctx, {
      dateRange: Q1_2025,
      rows: 'categoryGroup',
      measure: 'average',
      averagePer: 'month',
    });
    const byQuarter = await runWidgetQuery(t.ctx, {
      dateRange: { kind: 'fixed', from: '2025-01-01', to: '2025-04-30' },
      rows: 'quarter',
      measure: 'average',
      filters: { categoryGroupIds: [food.id] },
    });

    // Food over three months: -320.51 / 3 = -106.836…, rounded to -106.84.
    expect(byGroup.cells).toEqual([[200000], [-10684], [-1000]]);
    // Q1 has three months of the range, Q2 one (April), but no Transactions.
    expect(byQuarter.cells).toEqual([[-10684], [null]]);
    // The total divides by the four months of the range: -320.51 / 4 = -80.1275.
    expect(byQuarter.total).toBe(-8013);
  });
});

describe('date ranges', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** 2025-04-10 in Zurich. */
  const onApril10 = () =>
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2025-04-10T10:00:00Z') });

  it('covers the last N complete months, leaving out the current one', async () => {
    const { ubs } = await dataset();
    await seed(ubs, [{ bookingDate: '2025-04-02', amountMinor: -999 }]);
    onApril10();

    const report = await runWidgetQuery(t.ctx, {
      dateRange: { kind: 'last', count: 2, unit: 'month' },
      rows: 'month',
    });

    expect(report.range).toEqual({ from: '2025-02-01', to: '2025-03-31' });
    expect(report.partialPeriod).toBeNull();
    expect(keys(report.rows)).toEqual(['2025-02', '2025-03']);
    expect(report.cells).toEqual([[-12651], [-3000]]);
  });

  it('adds the current period up to today, flagged as partial, when asked', async () => {
    const { ubs } = await dataset();
    await seed(ubs, [
      { bookingDate: '2025-04-02', amountMinor: -999 },
      { bookingDate: '2025-04-11', amountMinor: -111 },
    ]);
    onApril10();

    const report = await runWidgetQuery(t.ctx, {
      dateRange: { kind: 'last', count: 1, unit: 'quarter', includeCurrent: true },
      rows: 'month',
    });

    expect(report.range).toEqual({ from: '2025-01-01', to: '2025-04-10' });
    expect(report.partialPeriod).toEqual({ from: '2025-04-01', to: '2025-04-10' });
    expect(report.rows.map((row) => [row.key, row.isPartial])).toEqual([
      ['2025-01', false],
      ['2025-02', false],
      ['2025-03', false],
      ['2025-04', true],
    ]);
    expect(report.cells.at(-1)).toEqual([-999]);
  });

  it('covers complete years and year to date', async () => {
    onApril10();

    const years = await runWidgetQuery(t.ctx, {
      dateRange: { kind: 'last', count: 2, unit: 'year' },
    });
    const ytd = await runWidgetQuery(t.ctx, { dateRange: { kind: 'yearToDate' } });

    expect(years.range).toEqual({ from: '2023-01-01', to: '2024-12-31' });
    expect(ytd.range).toEqual({ from: '2025-01-01', to: '2025-03-31' });
  });

  it('is empty in January for year to date of complete months', async () => {
    await dataset();
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2025-01-20T10:00:00Z') });

    const report = await runWidgetQuery(t.ctx, {
      dateRange: { kind: 'yearToDate' },
      rows: 'month',
    });

    expect(report.rows).toEqual([]);
    expect(report.total).toBeNull();
  });

  it('refuses a fixed range that ends before it starts', async () => {
    await expect(
      runWidgetQuery(t.ctx, {
        dateRange: { kind: 'fixed', from: '2025-02-01', to: '2025-01-01' },
      }),
    ).rejects.toThrow('From must not be after To');
  });
});

describe('drill down into a cell', () => {
  /** Every cell, row total, column total and the grand total equal the sum of their list. */
  async function expectDrillDownConsistent(query: WidgetQueryInput): Promise<void> {
    const report = await runWidgetQuery(t.ctx, query);
    const listed = async (cell: CellRef) => {
      const page = await listCellTransactions(t.ctx, query, { ...cell, pageSize: 200 });
      const sum = page.transactions.reduce((total, item) => total + item.chfMinor, 0);
      expect(page.sumChfMinor).toBe(page.total === 0 ? null : sum);
      expect(page.transactions).toHaveLength(page.total);
      return page.total === 0 ? null : sum;
    };
    for (const [r, row] of report.rows.entries()) {
      for (const [c, column] of report.columns.entries()) {
        expect(await listed({ row: row.key, column: column.key })).toBe(report.cells[r]![c]);
      }
      expect(await listed({ row: row.key })).toBe(report.rowTotals[r]);
    }
    for (const [c, column] of report.columns.entries()) {
      expect(await listed({ column: column.key })).toBe(report.columnTotals[c]);
    }
    expect(await listed({})).toBe(report.total);
  }

  it('lists the Transactions of a cell with their CHF values', async () => {
    const { groceries } = await dataset();

    const page = await listCellTransactions(
      t.ctx,
      { dateRange: Q1_2025, rows: 'month', columns: 'category' },
      { row: '2025-01', column: groceries.id },
    );

    expect(page.total).toBe(3);
    expect(page.sumChfMinor).toBe(-19400);
    expect(
      page.transactions.map((item) => [
        item.bookingDate,
        item.accountName,
        item.amountMinor,
        item.currency,
        item.chfMinor,
        item.category?.name,
      ]),
    ).toEqual([
      ['2025-01-20', 'UBS', 2000, 'CHF', 2000, 'Groceries'],
      ['2025-01-11', 'CA', -10000, 'EUR', -9400, 'Groceries'],
      ['2025-01-10', 'UBS', -12000, 'CHF', -12000, 'Groceries'],
    ]);
  });

  it('adds up, cell by cell, for month × Category', async () => {
    await dataset();
    await expectDrillDownConsistent({ dateRange: Q1_2025, rows: 'month', columns: 'category' });
  });

  it('adds up, cell by cell, for Tag × Payee and Capital in net cash flow', async () => {
    await dataset();
    await expectDrillDownConsistent({ dateRange: Q1_2025, rows: 'tag', columns: 'payee' });
    await expectDrillDownConsistent({
      dateRange: Q1_2025,
      rows: 'categoryGroupType',
      columns: 'quarter',
      includeCapital: true,
    });
  });

  it('pages through a cell, newest first', async () => {
    await dataset();

    const page = await listCellTransactions(
      t.ctx,
      { dateRange: Q1_2025 },
      { page: 2, pageSize: 3 },
    );

    expect(page).toMatchObject({ total: 7, page: 2, pageSize: 3, pageCount: 3 });
    expect(page.transactions.map((item) => item.bookingDate)).toEqual([
      '2025-01-25',
      '2025-01-20',
      '2025-01-11',
    ]);
    // The sum covers the whole cell, not just the page.
    expect(page.sumChfMinor).toBe(564949);
    const pastTheEnd = await listCellTransactions(t.ctx, { dateRange: Q1_2025 }, { page: 9 });
    expect(pastTheEnd).toMatchObject({ total: 7, sumChfMinor: 564949, transactions: [] });
  });
});

describe('filters', () => {
  it('filters by Account, Payee, Tag, Currency and Category group type', async () => {
    const { ca } = await dataset();
    const idOf = async (table: 'payee' | 'tag', name: string) =>
      (await t.ctx.db.query<{ id: string }>(`SELECT id FROM ${table} WHERE name = $1`, [name]))
        .rows[0]!.id;
    const total = async (filters: WidgetQueryInput['filters']) =>
      (await runWidgetQuery(t.ctx, { dateRange: Q1_2025, filters })).total;

    expect(await total({ accountIds: [ca.id] })).toBe(-14051);
    expect(await total({ payeeIds: [await idOf('payee', 'Migros')] })).toBe(-10000);
    expect(await total({ tagIds: [await idOf('tag', 'Family')] })).toBe(-20000);
    expect(await total({ currencies: ['EUR'] })).toBe(-14051);
    // Typed only: the unclassified -30.00 drops out.
    expect(await total({ categoryGroupTypes: ['income', 'expense'] })).toBe(567949);
    // Empty lists mean no filter, as an empty form submits them.
    expect(await total({ accountIds: [], currencies: [] })).toBe(564949);
  });
});
