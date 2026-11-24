import type { Page } from '@playwright/test';
import { presetStarts } from '../../src/lib/analytics/period';
import { formatPeriod } from '../../src/lib/format';
import { createAccount, listAccounts } from '../../src/server/services/accounts';
import { createBank } from '../../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../../src/server/services/categories';
import { swissToday } from '../../src/server/services/fx/dates';
import { editClassification } from '../../src/server/services/transactions';
import { createManualTransaction } from '../../src/server/services/transactions/manual';
import { withServices } from './services';

/**
 * What the Analytics specs share (analytics.spec.ts, card-period.spec.ts): the data they seed,
 * today's dates as the Periods read them, and the page's sections, Period control and heatmaps.
 */

export interface Seeded {
  description: string;
  account: string;
}

/**
 * A salary booked today, so it falls in the current interval of every Period, on an Account holding
 * money since 2021, so Net worth has a value at every interval end of every Period here.
 */
export async function seedSalary(suffix: number): Promise<Seeded> {
  const description = `Analytics salary ${suffix}`;
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Analytics bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Analytics account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 1_000_00,
      openingDate: '2021-01-01',
    });
    const group = await createCategoryGroup(ctx, { name: `Pay ${suffix}`, type: 'income' });
    const salary = await createCategory(ctx, { groupId: group.id, name: 'Salary' });
    const transaction = await createManualTransaction(ctx, {
      accountId: account.id,
      bookingDate: swissToday(),
      amountMinor: 4321_00,
      description,
    });
    await editClassification(ctx, transaction.id, { categoryId: salary.id });
  });
  return { description, account: `Analytics bank ${suffix} · Analytics account ${suffix}` };
}

/** A grocery purchase booked today, in the current interval of every Period; its description. */
export async function seedGrocery(suffix: number): Promise<string> {
  const description = `Analytics groceries ${suffix}`;
  await withServices(async (ctx) => {
    const account = (await listAccounts(ctx)).find(
      (item) => item.name === `Analytics account ${suffix}`,
    );
    const group = await createCategoryGroup(ctx, { name: `Living ${suffix}`, type: 'expense' });
    const groceries = await createCategory(ctx, { groupId: group.id, name: 'Groceries' });
    const transaction = await createManualTransaction(ctx, {
      accountId: account!.id,
      bookingDate: swissToday(),
      amountMinor: -87_00,
      description,
    });
    await editClassification(ctx, transaction.id, { categoryId: groceries.id });
  });
  return description;
}

/**
 * An older Transaction on a seeded Account (by default seedSalary's), early in 2021: no Period
 * starts before the first Transaction, so this lets every preset here read from the start it
 * gives, whatever else the database holds. A test that reads a Period's intervals needs it.
 */
export async function seedOldPurchase(
  suffix: number,
  accountName = `Analytics account ${suffix}`,
): Promise<void> {
  await withServices(async (ctx) => {
    const account = (await listAccounts(ctx)).find((item) => item.name === accountName);
    await createManualTransaction(ctx, {
      accountId: account!.id,
      bookingDate: '2021-01-05',
      amountMinor: -10_00,
      description: `Analytics old purchase ${suffix}`,
    });
  });
}

export const TODAY = swissToday();
export const [YEAR, MONTH] = TODAY.split('-') as [string, string];
export const LAST_YEAR = Number(YEAR) - 1;
export const QUARTER = `${YEAR}-Q${Math.ceil(Number(MONTH) / 3)}`;
export const CURRENT_MONTH = formatPeriod(`${YEAR}-${MONTH}`);
export const STARTS = presetStarts(TODAY);
export const ROLLING_START = STARTS['rolling-12-months'];
/** Last 12 months reaches into 13 calendar months, unless it starts on a month's first day. */
export const ROLLING_MONTHS = ROLLING_START.endsWith('-01') ? 12 : 13;
/** Since last year (this-year-and-last-1), by quarter: last year's four, then this year's up to the current one. */
export const QUARTERS = 4 + Math.ceil(Number(MONTH) / 3);

/** Analytics' Period control: a form named "Period". */
export const periodControl = (page: Page) => page.getByRole('form', { name: 'Period' });

/** A day `count` months before today's month, mid-month. */
export function monthsAgo(count: number): string {
  const date = new Date(Date.UTC(Number(YEAR), Number(MONTH) - 1 - count, 15));
  return date.toISOString().slice(0, 10);
}

export const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

export const heatmap = (page: Page, name: string) =>
  region(page, name).getByRole('table', { name: 'Heatmap' });

/** A heatmap's column headers: the intervals (the running one starred), then Total. */
export async function columns(page: Page, name: string): Promise<string[]> {
  return heatmap(page, name).getByRole('columnheader').allInnerTexts();
}

/** A heatmap's row by its header. */
export const heatmapRow = (page: Page, name: string, row: string) =>
  heatmap(page, name)
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: row, exact: true }) });

/**
 * Purchases booked today in three Categories, so the section is a ranking (as a stacked bar
 * Widget's card is from three series on), the first large enough to lead it in a shared DB.
 */
export async function seedPurchase(
  suffix: number,
): Promise<{ description: string; group: string }> {
  const description = `Analytics purchase ${suffix}`;
  const groupName = `Spend ${suffix}`;
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Spending bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Spending account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    const group = await createCategoryGroup(ctx, { name: groupName, type: 'expense' });
    for (const [name, amountMinor, label] of [
      ['Furniture', -987_654_32, description],
      ['Lamps', -300_00, `${description} lamp`],
      ['Rugs', -200_00, `${description} rug`],
    ] as const) {
      const category = await createCategory(ctx, { groupId: group.id, name });
      const transaction = await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: swissToday(),
        amountMinor,
        description: label,
      });
      await editClassification(ctx, transaction.id, { categoryId: category.id });
    }
  });
  return { description, group: groupName };
}
