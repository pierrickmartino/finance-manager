import { expect, test, type Page } from '@playwright/test';
import { formatPeriod } from '../src/lib/format';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { withServices } from './support/services';

/**
 * Analytics (spec #170): the Period view switch, Net worth, Recent transactions, Net cash
 * flow, Account balances in CHF, Spending by Category, the Income vs. expense table and the
 * Categories per period table.
 */

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

test('/ lands on Analytics in Month', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Period view' }).getByRole('link', { name: 'Month' }),
  ).toHaveAttribute('aria-current', 'page');
});

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

test('Spending Insights draws the current period to date and a bar opens its Drill-down', async ({
  page,
}) => {
  const suffix = Date.now();
  const description = `Analytics groceries ${suffix}`;
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Insights bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Insights account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    const group = await createCategoryGroup(ctx, { name: `Living ${suffix}`, type: 'expense' });
    const groceries = await createCategory(ctx, { groupId: group.id, name: 'Groceries' });
    const transaction = await createManualTransaction(ctx, {
      accountId: account.id,
      bookingDate: swissToday(),
      amountMinor: -12_34,
      description,
    });
    await editClassification(ctx, transaction.id, { categoryId: groceries.id });
  });
  const insights = page.getByRole('region', { name: 'Spending Insights' });

  await page.goto('/analytics');
  await expect(
    insights.getByRole('link', {
      name: new RegExp(`^${formatPeriod(`${YEAR}-${MONTH}`)} to date: `),
    }),
  ).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Period view' })
    .getByRole('link', { name: 'Quarter' })
    .click();
  await expect(page).toHaveURL(/\/analytics\?period=quarter$/);
  const current = insights.getByRole('link', {
    name: new RegExp(`^${formatPeriod(QUARTER)} to date: `),
  });
  await expect(current).toBeVisible();

  await current.click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
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
  const scroller = page
    .getByRole('region', { name: 'Income vs. expense' })
    .getByTestId('period-table-scroll');
  const tableOverflows = await scroller.evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );
  expect(tableOverflows).toBe(true);
});

test('Net worth reads today, with a point per period end of the window and its change', async ({
  page,
}) => {
  await seedSalary(Date.now());
  const netWorth = page.getByRole('region', { name: 'Net worth' });
  const today = netWorth.getByRole('link', { name: /^Net worth today: / });

  for (const [view, length, words] of [
    ['month', 12, 'months'],
    ['quarter', 8, 'quarters'],
    ['year', 6, 'years'],
  ] as const) {
    await page.goto(`/analytics?period=${view}`);
    await expect(today).toBeVisible();
    const trend = netWorth.getByRole('group', {
      name: `Net worth over the last ${length} ${words}`,
    });
    await expect(trend.getByRole('link')).toHaveCount(length);
    await expect(trend.getByRole('link').last()).toHaveAccessibleName(/^Today: /);
    await expect(netWorth.getByText(/since the end of /)).toBeVisible();
  }

  // Today's amount opens the Accounts as they stand today.
  await today.click();
  await expect(page).toHaveURL(new RegExp(`/accounts\\?date=${swissToday()}$`));
});

const categories = (page: Page) => page.getByRole('table', { name: 'Categories per period' });

test('Categories per period lists each Category under its group subtotal, and both open their Drill-down', async ({
  page,
}) => {
  const suffix = Date.now();
  const description = await seedSalary(suffix);
  const current = `${formatPeriod(`${YEAR}-${MONTH}`)} to date`;

  await page.goto('/analytics');
  const group = categories(page)
    .getByRole('row')
    .filter({
      has: page.getByRole('rowheader', { name: `Pay ${suffix}`, exact: true }),
    });
  await expect(group).toBeVisible();
  const category = group.locator('xpath=following-sibling::tr[1]');
  await expect(category.getByRole('rowheader')).toHaveText('Salary');

  // The group's subtotal for the current month opens the Transactions behind it.
  await group.getByRole('link', { name: new RegExp(`^Pay ${suffix}, ${current}: `) }).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=month$/);

  // So does the Category's Total.
  await category.getByRole('link', { name: /^Salary, Total: / }).click();
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
});

test('on a phone Categories per period scrolls sideways inside its card', async ({ page }) => {
  await seedSalary(Date.now());
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/analytics');
  await expect(categories(page)).toBeVisible();

  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
  const scroller = page
    .getByRole('region', { name: 'Categories per period' })
    .getByTestId('period-table-scroll');
  expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  );
});

test('Recent transactions and Account balances stay the same in every Period view and open their pages', async ({
  page,
}) => {
  const suffix = Date.now();
  const description = await seedSalary(suffix);
  const account = `Analytics bank ${suffix} · Analytics account ${suffix}`;
  const recent = page.getByRole('region', { name: 'Recent transactions' });
  const balances = page.getByRole('table', { name: 'Account balances in CHF' });

  for (const view of ['month', 'quarter', 'year']) {
    await page.goto(`/analytics?period=${view}`);
    await expect(recent.getByRole('link', { name: new RegExp(description) })).toBeVisible();
    await expect(balances.getByRole('row', { name: new RegExp(account) })).toContainText(
      /4\D?321\.00/,
    );
  }

  await recent.getByRole('link', { name: new RegExp(description) }).click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}/);

  await page.goto('/analytics');
  await balances.getByRole('link', { name: account }).click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}/);
});

/** A purchase booked today, large enough to rank among the 8 named Categories in a shared DB. */
async function seedPurchase(suffix: number): Promise<{ description: string; label: string }> {
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
    const category = await createCategory(ctx, { groupId: group.id, name: 'Furniture' });
    const transaction = await createManualTransaction(ctx, {
      accountId: account.id,
      bookingDate: swissToday(),
      amountMinor: -987_654_32,
      description,
    });
    await editClassification(ctx, transaction.id, { categoryId: category.id });
  });
  return { description, label: `${groupName} › Furniture` };
}

test('Spending by Category draws the current period to date and a Category opens its Drill-down', async ({
  page,
}) => {
  const { description, label } = await seedPurchase(Date.now());

  await page.goto('/analytics?period=quarter');
  const section = page.getByRole('region', { name: 'Spending by Category' });
  await expect(section.getByRole('figure', { name: /stacked bar chart$/ })).toBeVisible();
  await expect(section.getByText(`${formatPeriod(QUARTER)} to date`)).toBeVisible();

  const legend = section.getByRole('list', { name: 'Spending by Category legend' });
  await legend.getByRole('link', { name: new RegExp(`^${label}, Total: `) }).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=quarter$/);
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

  // On a wide screen it sits beside Account balances, on the left.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/analytics');
  const flowBox = (await page.getByRole('region', { name: 'Net cash flow' }).boundingBox())!;
  const balancesBox = (await page
    .getByRole('region', { name: 'Account balances in CHF' })
    .boundingBox())!;
  expect(flowBox.y).toBe(balancesBox.y);
  expect(flowBox.x + flowBox.width).toBeLessThan(balancesBox.x);

  await toDate(formatPeriod(`${YEAR}-${MONTH}`)).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=month$/);
});

test('on a wide screen Net worth, Spending Insights and Recent transactions share the first row', async ({
  page,
}) => {
  await seedSalary(Date.now());
  // Each section's box once it has loaded (its placeholder has the same name).
  const boxOf = async (name: string) => {
    const region = page.getByRole('region', { name });
    await expect(region).not.toHaveAttribute('aria-busy', 'true');
    return (await region.boundingBox())!;
  };
  const overview = ['Net worth', 'Spending Insights', 'Recent transactions'];

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/analytics');
  const [netWorth, insights, recent] = await Promise.all(overview.map(boxOf));
  expect(insights!.y).toBe(netWorth!.y);
  expect(recent!.y).toBe(netWorth!.y);
  expect(netWorth!.x + netWorth!.width).toBeLessThan(insights!.x);
  expect(insights!.x + insights!.width).toBeLessThan(recent!.x);

  // One column on a phone, in the same order.
  await page.setViewportSize({ width: 390, height: 900 });
  const [narrowWorth, narrowInsights, narrowRecent] = await Promise.all(overview.map(boxOf));
  expect(narrowWorth!.x).toBe(narrowInsights!.x);
  expect(narrowWorth!.y + narrowWorth!.height).toBeLessThan(narrowInsights!.y);
  expect(narrowInsights!.y + narrowInsights!.height).toBeLessThan(narrowRecent!.y);
});

/** An Account in a Currency the E2E database has no FX rate for, with an expense booked today. */
async function seedUnconverted(suffix: number): Promise<void> {
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Unconverted bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Unconverted account ${suffix}`,
      currency: 'ISK',
      openingBalanceMinor: 50_000_00,
      openingDate: '2021-01-01',
    });
    const group = await createCategoryGroup(ctx, { name: `Abroad ${suffix}`, type: 'expense' });
    const category = await createCategory(ctx, { groupId: group.id, name: 'Travel' });
    const transaction = await createManualTransaction(ctx, {
      accountId: account.id,
      bookingDate: swissToday(),
      amountMinor: -1_234_00,
      description: `Unconverted purchase ${suffix}`,
    });
    await editClassification(ctx, transaction.id, { categoryId: category.id });
  });
}

test('every section with figures left out for want of an FX rate says so', async ({ page }) => {
  await seedUnconverted(Date.now());
  await page.goto('/analytics');
  for (const name of [
    'Net worth',
    'Spending Insights',
    'Net cash flow',
    'Account balances in CHF',
    'Spending by Category',
    'Income vs. expense',
    'Categories per period',
  ]) {
    await expect(
      page.getByRole('region', { name }).getByText(/left out: no FX rate yet\./),
    ).toBeVisible();
  }
});
