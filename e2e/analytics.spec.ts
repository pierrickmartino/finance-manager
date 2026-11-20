import { expect, test, type Page } from '@playwright/test';
import { formatPeriod } from '../src/lib/format';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { withServices } from './support/services';

/** Analytics (spec #170): the Period view switch, Income vs. expense and Net cash flow. */

/** A salary booked today, so it falls in the current period of every Period view. */
async function seedSalary(suffix: number): Promise<string> {
  const description = `Analytics salary ${suffix}`;
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Analytics bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Analytics account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
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
  return description;
}

const [YEAR, MONTH] = swissToday().split('-') as [string, string];
const QUARTER = `${YEAR}-Q${Math.ceil(Number(MONTH) / 3)}`;

const table = (page: Page) => page.getByRole('table', { name: 'Income vs. expense' });

/** The table's column headers: the periods, then Total and Average. */
async function columns(page: Page): Promise<string[]> {
  const headers = await table(page).getByRole('columnheader').allInnerTexts();
  return headers.slice(1).map((header) => header.replace(/\s+/g, ' ').trim());
}

test('the Period view switches the Income vs. expense table and a cell opens its Drill-down', async ({
  page,
}) => {
  const description = await seedSalary(Date.now());
  const periodSwitch = page.getByRole('navigation', { name: 'Period view' });

  // Month is the default: 12 months, the current one to date.
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
  await expect(periodSwitch.getByRole('link', { name: 'Month' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(table(page)).toBeVisible();
  let headers = await columns(page);
  expect(headers).toHaveLength(12 + 2);
  expect(headers.slice(-3)).toEqual([
    `${formatPeriod(`${YEAR}-${MONTH}`)} to date`,
    'Total',
    'Average',
  ]);
  for (const row of [
    'Income',
    'Expense',
    'Capital',
    'Net (income − expense)',
    'Net incl. Capital',
  ]) {
    await expect(table(page).getByRole('rowheader', { name: row, exact: true })).toBeVisible();
  }

  await periodSwitch.getByRole('link', { name: 'Quarter' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=quarter$/);
  await expect(periodSwitch.getByRole('link', { name: 'Quarter' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(table(page).getByRole('columnheader').nth(8)).toHaveText(
    new RegExp(`^${formatPeriod(QUARTER)}\\s*to date$`),
  );
  headers = await columns(page);
  expect(headers).toHaveLength(8 + 2);

  await periodSwitch.getByRole('link', { name: 'Year' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=year$/);
  await expect(table(page).getByRole('columnheader').nth(6)).toHaveText(
    new RegExp(`^${YEAR}\\s*to date$`),
  );
  headers = await columns(page);
  expect(headers).toHaveLength(6 + 2);
  expect(headers[0]).toBe(String(Number(YEAR) - 5));

  // A reload keeps the Period view.
  await page.reload();
  await expect(periodSwitch.getByRole('link', { name: 'Year' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // The current year's income opens the Transactions behind it, with a way back.
  await table(page)
    .getByRole('link', { name: new RegExp(`^Income, ${YEAR} to date: `) })
    .click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=year$/);
});

test('on a phone the switch stays at the top and the table scrolls inside its card', async ({
  page,
}) => {
  await seedSalary(Date.now());
  // Short, so the page scrolls past the switch with one section.
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto('/analytics');
  await expect(table(page)).toBeVisible();

  const periodSwitch = page.getByRole('navigation', { name: 'Period view' });
  const top = (await periodSwitch.boundingBox())!.y;
  await page.evaluate((by) => window.scrollTo(0, by), top + 20);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top);
  await expect.poll(async () => (await periodSwitch.boundingBox())?.y).toBe(0);

  // The page never scrolls sideways: the table does, inside its card.
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
  const scroller = page.getByTestId('period-table-scroll');
  const tableOverflows = await scroller.evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );
  expect(tableOverflows).toBe(true);
});

test('Net cash flow has a point per period, the current one to date, each opening its Drill-down', async ({
  page,
}) => {
  const description = await seedSalary(Date.now());
  const line = page.getByRole('figure', { name: 'Net cash flow line chart' });
  const toDate = (label: string) =>
    line.getByRole('link', { name: new RegExp(`^Net cash flow, ${label} to date: `) });

  await page.goto('/analytics?period=quarter');
  await expect(toDate(formatPeriod(QUARTER))).toBeVisible();

  await page.goto('/analytics?period=year');
  await expect(toDate(YEAR)).toBeVisible();
  // At most one point per period: the window's 6 years.
  expect(await line.getByRole('link').count()).toBeLessThanOrEqual(6);

  await page.goto('/analytics');
  await toDate(formatPeriod(`${YEAR}-${MONTH}`)).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=month$/);
});
