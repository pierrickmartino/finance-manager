import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_SPAN, presetStarts, spanDates, spanPhrase } from '../src/lib/analytics/span';
import { formatPeriod } from '../src/lib/format';
import { createAccount, listAccounts } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { withServices } from './support/services';

/**
 * Analytics (spec #170, #204): the Span control, and each section drawn as the Dashboard's own
 * card: Net worth, Spending Insights, Recent transactions, Net cash flow, Account balances in
 * CHF, Spending by Category, and the Income vs. expense and Categories per period heatmaps.
 */

interface Seeded {
  description: string;
  account: string;
}

/**
 * A salary booked today, so it falls in the current period of every Span, on an Account holding
 * money since 2021, so Net worth has a value at every period end of every Span here.
 */
async function seedSalary(suffix: number): Promise<Seeded> {
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

/** A grocery purchase booked today, in the current period of every Span; its description. */
async function seedGrocery(suffix: number): Promise<string> {
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

const TODAY = swissToday();
const [YEAR, MONTH] = TODAY.split('-') as [string, string];
const LAST_YEAR = Number(YEAR) - 1;
const QUARTER = `${YEAR}-Q${Math.ceil(Number(MONTH) / 3)}`;
const CURRENT_MONTH = formatPeriod(`${YEAR}-${MONTH}`);
const STARTS = presetStarts(TODAY);
const ROLLING_START = STARTS['rolling-12-months'];
/** Rolling 12 months reaches into 13 calendar months, unless it starts on a month's first day. */
const ROLLING_MONTHS = ROLLING_START.endsWith('-01') ? 12 : 13;
/** This year and last 1, by quarter: last year's four, then this year's up to the current one. */
const QUARTERS = 4 + Math.ceil(Number(MONTH) / 3);

/** Analytics' Span control: a form named "Span". */
const spanControl = (page: Page) => page.getByRole('form', { name: 'Span' });

/** A day `count` months before today's month, mid-month. */
function monthsAgo(count: number): string {
  const date = new Date(Date.UTC(Number(YEAR), Number(MONTH) - 1 - count, 15));
  return date.toISOString().slice(0, 10);
}

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

const heatmap = (page: Page, name: string) =>
  region(page, name).getByRole('table', { name: 'Heatmap' });

/** A heatmap's column headers: the periods (the running one starred), then Total. */
async function columns(page: Page, name: string): Promise<string[]> {
  return heatmap(page, name).getByRole('columnheader').allInnerTexts();
}

/** A heatmap's row by its header. */
const heatmapRow = (page: Page, name: string, row: string) =>
  heatmap(page, name)
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: row, exact: true }) });

test('/ lands on Analytics over Rolling 12 months, its dates in words', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
  const control = spanControl(page);
  await expect(control.getByLabel('Span', { exact: true })).toHaveValue('rolling-12-months');
  await expect(control.getByLabel('From', { exact: true })).toHaveValue(ROLLING_START);
  await expect(
    control.getByText(spanPhrase(DEFAULT_SPAN, { from: ROLLING_START, to: TODAY })),
  ).toBeVisible();
});

test('picking a Span preset fills in its date, reads every section over it, and a Drill-down returns to it', async ({
  page,
}) => {
  const { description } = await seedSalary(Date.now());
  const control = spanControl(page);
  const preset = control.getByLabel('Span', { exact: true });
  const name = 'Income vs. expense';
  const incomeCaption = region(page, 'Key figures')
    .getByRole('region', { name: 'Income', exact: true })
    .getByText(/ to date$/);

  // Rolling 12 months: a month each, the first cut short (unless it starts on the 1st) and the
  // current one starred as running, then Total.
  await page.goto('/analytics');
  await expect(heatmap(page, name)).toBeVisible();
  let headers = await columns(page, name);
  expect(headers).toHaveLength(ROLLING_MONTHS + 1);
  expect(headers.slice(-2)).toEqual([`${CURRENT_MONTH.split(' ')[0]}*`, 'Total']);
  expect(headers[0]!.endsWith('*')).toBe(ROLLING_MONTHS === 13);
  for (const row of [
    'Income',
    'Expense',
    'Capital',
    'Net (income − expense)',
    'Net incl. Capital',
  ]) {
    await expect(
      heatmap(page, name).getByRole('rowheader', { name: row, exact: true }),
    ).toBeVisible();
  }

  // This year and last 1: by quarter, from 1 January last year.
  await preset.selectOption('this-year-and-last-1');
  await expect(page).toHaveURL(/\/analytics\?span=this-year-and-last-1$/);
  await expect(control.getByLabel('From', { exact: true })).toHaveValue(`${LAST_YEAR}-01-01`);
  await expect(
    heatmap(page, name)
      .getByRole('columnheader')
      .nth(QUARTERS - 1),
  ).toHaveText(`${formatPeriod(QUARTER)}*`);
  headers = await columns(page, name);
  expect(headers).toHaveLength(QUARTERS + 1);
  await expect(incomeCaption).toHaveText(`${formatPeriod(QUARTER)} to date`);

  // This year and last 4: by year, the first four years before this one.
  await preset.selectOption('this-year-and-last-4');
  await expect(page).toHaveURL(/\/analytics\?span=this-year-and-last-4$/);
  await expect(heatmap(page, name).getByRole('columnheader').nth(4)).toHaveText(`${YEAR}*`);
  headers = await columns(page, name);
  expect(headers).toHaveLength(5 + 1);
  expect(headers[0]).toBe(String(Number(YEAR) - 4));
  await expect(incomeCaption).toHaveText(`${YEAR} to date`);
  await expect(
    region(page, 'Net cash flow').getByRole('link', {
      name: new RegExp(`^${YEAR} \\(partial\\): `),
    }),
  ).toBeVisible();

  // A reload keeps the Span.
  await page.reload();
  await expect(preset).toHaveValue('this-year-and-last-4');

  // The current year's income opens the Transactions behind it, with a way back to the Span.
  await heatmap(page, name)
    .getByRole('link', { name: new RegExp(`^Income, ${YEAR} \\(partial\\): `) })
    .click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?span=this-year-and-last-4$/);
  await expect(preset).toHaveValue('this-year-and-last-4');
});

test('typing a start date switches the Span to Custom, reads every section from it, and a Drill-down returns to it', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  // An older Transaction, so the typed date is never before the first one (and stays as typed).
  await withServices(async (ctx) => {
    const account = (await listAccounts(ctx)).find(
      (item) => item.name === `Analytics account ${suffix}`,
    );
    await createManualTransaction(ctx, {
      accountId: account!.id,
      bookingDate: '2021-01-05',
      amountMinor: -10_00,
      description: `Analytics old purchase ${suffix}`,
    });
  });
  const from = monthsAgo(2);
  const atFrom = new RegExp(`/analytics\\?from=${from}$`);
  const control = spanControl(page);
  const preset = control.getByLabel('Span', { exact: true });
  const date = control.getByLabel('From', { exact: true });
  const name = 'Income vs. expense';

  await page.goto('/analytics');
  await date.fill(from);
  await expect(preset).toHaveValue('custom');
  await control.getByRole('button', { name: 'Show' }).click();

  await expect(page).toHaveURL(atFrom);
  await expect(preset).toHaveValue('custom');
  await expect(date).toHaveValue(from);
  await expect(
    control.getByText(spanPhrase({ kind: 'custom', from }, { from, to: TODAY })),
  ).toBeVisible();
  // Three months, the first cut short at the 15th and the current one running, then Total.
  await expect(heatmap(page, name).getByRole('columnheader')).toHaveCount(3 + 1);
  const headers = await columns(page, name);
  expect(headers[0]!.endsWith('*')).toBe(true);
  expect(headers.slice(-2)).toEqual([`${CURRENT_MONTH.split(' ')[0]}*`, 'Total']);
  await expect(
    region(page, 'Net cash flow').getByRole('link', {
      name: new RegExp(`^${CURRENT_MONTH} \\(partial\\): `),
    }),
  ).toBeVisible();

  // A bookmark keeps its start date: reloading reads from it again.
  await page.reload();
  await expect(date).toHaveValue(from);

  // The current month's income opens the Transactions behind it, with a way back to the Span.
  await heatmap(page, name)
    .getByRole('link', { name: new RegExp(`^Income, ${CURRENT_MONTH} \\(partial\\): `) })
    .click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*originFrom=/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(atFrom);
  await expect(preset).toHaveValue('custom');

  // Picking a preset refills the date.
  await preset.selectOption('year-to-date');
  await expect(page).toHaveURL(/\/analytics\?span=year-to-date$/);
  await expect(date).toHaveValue(`${YEAR}-01-01`);
});

test('a former Period view link redirects to its nearest Span', async ({ page }) => {
  for (const [period, span] of [
    ['month', 'rolling-12-months'],
    ['quarter', 'this-year-and-last-1'],
    ['year', 'this-year-and-last-4'],
  ] as const) {
    await page.goto(`/analytics?period=${period}`);
    await expect(page).toHaveURL(new RegExp(`/analytics\\?span=${span}$`));
    await expect(spanControl(page).getByLabel('Span', { exact: true })).toHaveValue(span);
  }
});

test('Spending Insights judges the last complete month whatever the Span and opens its Transactions', async ({
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
    // Two complete months with spending: the insight compares the latest with the one before.
    for (const [bookingDate, label] of [
      [monthsAgo(2), `${description} before`],
      [monthsAgo(1), description],
    ] as const) {
      const transaction = await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate,
        amountMinor: -12_34,
        description: label,
      });
      await editClassification(ctx, transaction.id, { categoryId: groceries.id });
    }
  });

  // Rolling 30 days holds no complete month, yet the insight still speaks of the last one.
  await page.goto('/analytics?span=rolling-30-days');
  const latest = page.getByRole('link', { name: 'See the Transactions' });
  await expect(page.getByRole('heading', { name: /^Spending is / })).toBeVisible();
  await latest.click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description, {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?span=rolling-30-days$/);
});

test('on a phone the Span control stays at the top and the heatmap scrolls inside its card', async ({
  page,
}) => {
  await seedSalary(Date.now());
  // Short, so the page scrolls past the control with one section.
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto('/analytics');
  await expect(heatmap(page, 'Income vs. expense')).toBeVisible();

  const control = spanControl(page);
  const top = (await control.boundingBox())!.y;
  await page.evaluate((by) => window.scrollTo(0, by), top + 20);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top);
  await expect.poll(async () => (await control.boundingBox())?.y).toBe(0);

  // The page never scrolls sideways: the heatmap does, inside its card.
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
  for (const name of ['Income vs. expense', 'Categories per period']) {
    const scroller = region(page, name).locator('figure');
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
  }
});

test('Net worth reads today, with a point per period end of the Span and its change since the previous one', async ({
  page,
}) => {
  await seedSalary(Date.now());
  const netWorth = region(page, 'Your net worth today');

  for (const [span, length, current, change] of [
    ['rolling-12-months', ROLLING_MONTHS, CURRENT_MONTH, '1M'],
    ['this-year-and-last-1', QUARTERS, formatPeriod(QUARTER), '1Q'],
    ['this-year-and-last-4', 5, YEAR, '1Y'],
  ] as const) {
    await page.goto(`/analytics?span=${span}`);
    const trend = netWorth.getByRole('group', {
      name: `Net worth, ${spanDates({ from: STARTS[span], to: TODAY })}`,
    });
    await expect(trend.getByRole('link')).toHaveCount(length);
    await expect(trend.getByRole('link').last()).toHaveAccessibleName(new RegExp(`^${current}: `));
    await expect(
      netWorth.getByRole('list', { name: 'Change in Net worth' }).getByRole('link').first(),
    ).toHaveAccessibleName(new RegExp(`^${change}: .* since the end of `));
    await expect(netWorth.getByText('Came in')).toBeVisible();
    // Income minus expense is Profit (GLOSSARY), and its share of Income the Profit margin.
    await expect(netWorth.getByText('Profit', { exact: true })).toBeVisible();
    await expect(netWorth.getByText('Profit margin', { exact: true })).toBeVisible();
    await expect(netWorth.getByText(/profit over \d+ /)).toBeVisible();
    await expect(netWorth.getByText(/Kept|Savings rate/)).toHaveCount(0);
  }

  // Today's amount opens the Accounts.
  await netWorth.getByRole('link', { name: /^CHF / }).first().click();
  await expect(page).toHaveURL(/\/accounts$/);
});

test('Key figures open Analytics with four tiles: one row on a wide screen, 2×2 on a narrow one', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  const grocery = await seedGrocery(suffix);
  const keyFigures = region(page, 'Key figures');
  const tiles = ['Net worth', 'Income', 'Expense', 'Profit'].map((name) =>
    keyFigures.getByRole('region', { name, exact: true }),
  );
  const amountOf = (index: number) => tiles[index]!.getByRole('link', { name: /^CHF / });
  const boxes = async () => {
    await expect(keyFigures).not.toHaveAttribute('aria-busy');
    return Promise.all(tiles.map(async (tile) => (await tile.boundingBox())!));
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/analytics');
  for (const index of [0, 1, 2, 3]) await expect(amountOf(index)).toBeVisible();
  await expect(tiles[0]!.getByText('Today', { exact: true })).toBeVisible();
  for (const tile of tiles.slice(1)) {
    await expect(tile.getByText(`${CURRENT_MONTH} to date`, { exact: true })).toBeVisible();
  }
  // Above the overview row, all four in one row of equal tiles.
  const wide = await boxes();
  const overview = (await region(page, 'Your net worth today').boundingBox())!;
  for (const box of wide) {
    expect(box.y).toBe(wide[0]!.y);
    expect(Math.round(box.width)).toBe(Math.round(wide[0]!.width));
    expect(box.y + box.height).toBeLessThan(overview.y);
  }
  for (const [i, box] of wide.slice(1).entries()) {
    expect(wide[i]!.x + wide[i]!.width).toBeLessThan(box.x);
  }

  // A 2×2 grid on a phone: Net worth and Income, then Expense and Profit.
  await page.setViewportSize({ width: 390, height: 900 });
  const [netWorth, income, expense, profit] = await boxes();
  expect(income!.y).toBe(netWorth!.y);
  expect(netWorth!.x + netWorth!.width).toBeLessThan(income!.x);
  expect(expense!.x).toBe(netWorth!.x);
  expect(profit!.x).toBe(income!.x);
  expect(expense!.y).toBe(profit!.y);
  expect(netWorth!.y + netWorth!.height).toBeLessThan(expense!.y);

  // Income and Profit open their Drill-downs, with today's salary in both; Expense its own.
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const index of [1, 3]) {
    await amountOf(index).click();
    await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
    await expect(
      page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to Analytics' }).click();
    await expect(page).toHaveURL(/\/analytics\?span=rolling-12-months$/);
  }
  await amountOf(2).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  // Expense lists what went out today, and not the salary that came in.
  const drilled = page.getByRole('table', { name: 'Drill-down Transactions' });
  await expect(drilled.getByText(grocery)).toBeVisible();
  await expect(drilled.getByText(description)).toHaveCount(0);

  // Net worth stays today's whatever the Span, and opens the Accounts as of today.
  await page.goto('/analytics?span=this-year-and-last-4');
  await expect(tiles[0]!.getByText('Today', { exact: true })).toBeVisible();
  await expect(tiles[1]!.getByText(`${YEAR} to date`, { exact: true })).toBeVisible();
  await amountOf(0).click();
  await expect(page).toHaveURL(new RegExp(`/accounts\\?date=${swissToday()}$`));
});

test("a Key figure's change line opens both stretches of days, and Net worth's the Accounts then", async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  // On the first of last month: always inside the Comparison span.
  const lastMonthFirst = `${monthsAgo(1).slice(0, 8)}01`;
  const earlier = `Analytics earlier groceries ${suffix}`;
  await withServices(async (ctx) => {
    // On the salary's own Account, lowering its balance: a new or larger Account would crowd
    // the Account balances card, which keeps only the largest.
    const account = (await listAccounts(ctx)).find(
      (candidate) => candidate.name === `Analytics account ${suffix}`,
    )!;
    const group = await createCategoryGroup(ctx, {
      name: `Earlier living ${suffix}`,
      type: 'expense',
    });
    const groceries = await createCategory(ctx, { groupId: group.id, name: 'Groceries' });
    const transaction = await createManualTransaction(ctx, {
      accountId: account.id,
      bookingDate: lastMonthFirst,
      amountMinor: -1234_00,
      description: earlier,
    });
    await editClassification(ctx, transaction.id, { categoryId: groceries.id });
  });
  const keyFigures = region(page, 'Key figures');
  const changeOf = (name: string) =>
    keyFigures.getByRole('region', { name, exact: true }).getByRole('link', { name: / vs / });

  await page.goto('/analytics');
  for (const name of ['Net worth', 'Income', 'Expense', 'Profit']) {
    await expect(changeOf(name)).toBeVisible();
  }
  await expect(changeOf('Income')).toHaveAccessibleName(/^(Up|Down|Unchanged) .*vs 1(–\d+)? /);

  // Profit's change opens both stretches of both: today's salary and last month's groceries.
  await changeOf('Profit').click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  const table = page.getByRole('table', { name: 'Drill-down Transactions' });
  await expect(table.getByText(description)).toBeVisible();
  await expect(table.getByText(earlier)).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?span=rolling-12-months$/);

  const lastMonthEnd = new Date(Date.UTC(Number(YEAR), Number(MONTH) - 1, 0))
    .toISOString()
    .slice(0, 10);
  await changeOf('Net worth').click();
  await expect(page).toHaveURL(new RegExp(`/accounts\\?date=${lastMonthEnd}$`));
});

test('each Key figure carries a sparkline, hidden from assistive technology, that fits its tile', async ({
  page,
}) => {
  await seedSalary(Date.now());
  const keyFigures = region(page, 'Key figures');
  const tiles = ['Net worth', 'Income', 'Expense', 'Profit'].map((name) =>
    keyFigures.getByRole('region', { name, exact: true }),
  );
  const sparklines = keyFigures.locator('[data-sparkline]');

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/analytics');
    await expect(keyFigures).not.toHaveAttribute('aria-busy');
    await expect(sparklines).toHaveCount(4);
    for (const tile of tiles) {
      const sparkline = tile.locator('[data-sparkline]');
      await expect(sparkline).toBeVisible();
      await expect(sparkline).toHaveAttribute('aria-hidden', 'true');
      // The current period is partial: a dashed last segment to a hollow dot.
      await expect(sparkline.locator('path[stroke-dasharray]')).toHaveCount(1);
      await expect(sparkline.locator('span.bg-surface')).toHaveCount(1);
      // Inside its tile, dot and line included, and the tile not overflowing either.
      const box = (await tile.boundingBox())!;
      for (const part of [sparkline.locator('svg'), sparkline.locator('span')]) {
        const inner = (await part.boundingBox())!;
        expect(inner.x, `${width}px`).toBeGreaterThanOrEqual(box.x);
        expect(inner.x + inner.width, `${width}px`).toBeLessThanOrEqual(box.x + box.width);
        expect(inner.y + inner.height, `${width}px`).toBeLessThanOrEqual(box.y + box.height);
      }
      expect(
        await tile.evaluate((node) => node.scrollWidth <= node.clientWidth),
        `${width}px`,
      ).toBe(true);
    }
  }
  // Nothing in the sparklines is in the page's accessibility tree.
  const tree = await keyFigures.ariaSnapshot();
  expect(tree).not.toMatch(/img|graphics|svg/i);
});

test('Categories per period lists each Category beside its group subtotal, and both open their Drill-down', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  const name = 'Categories per period';

  await page.goto('/analytics');
  const group = heatmapRow(page, name, `Pay ${suffix}`);
  const category = heatmapRow(page, name, `Pay ${suffix} › Salary`);
  await expect(group).toBeVisible();
  await expect(category).toBeVisible();

  // The group's subtotal for the current month opens the Transactions behind it.
  await group
    .getByRole('link', { name: new RegExp(`^Pay ${suffix}, ${CURRENT_MONTH} \\(partial\\): `) })
    .click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?span=rolling-12-months$/);

  // So does the Category's Total, the row's last figure.
  await category.getByRole('link').last().click();
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
});

test('Recent transactions and Account balances stay the same whatever the Span and open their pages', async ({
  page,
}) => {
  const { description, account } = await seedSalary(Date.now());
  const recent = region(page, 'Recent transactions');
  const balances = region(page, 'Account balances in CHF');
  // The opening 1'000.00 and today's salary of 4'321.00.
  const balance = balances.getByRole('link', { name: new RegExp(`^${account}.*5\\D?321`) });

  for (const span of ['rolling-30-days', 'this-year-and-last-1', 'this-year-and-last-4']) {
    await page.goto(`/analytics?span=${span}`);
    await expect(recent.getByRole('link', { name: new RegExp(description) })).toBeVisible();
    await expect(balance).toBeVisible();
  }

  await recent.getByRole('link', { name: new RegExp(description) }).click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}/);

  await page.goto('/analytics');
  await balance.click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}/);
});

/**
 * Purchases booked today in three Categories, so the section is a ranking (as a stacked bar
 * Widget's card is from three series on), the first large enough to lead it in a shared DB.
 */
async function seedPurchase(suffix: number): Promise<{ description: string; group: string }> {
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

test('Spending by Category ranks the largest Categories and a Category opens its Drill-down', async ({
  page,
}) => {
  const { description, group } = await seedPurchase(Date.now());

  await page.goto('/analytics?span=this-year-and-last-1');
  const section = region(page, 'Spending by Category');
  await expect(section.getByText('Furniture leads')).toBeVisible();
  await expect(section.getByText(/^Heaviest quarter: /)).toBeVisible();
  await expect(section.getByText(/^Quarterly average$/)).toBeVisible();

  await section.getByRole('link', { name: new RegExp(`^Furniture\\s*${group}`) }).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page
      .getByRole('table', { name: 'Drill-down Transactions' })
      .getByText(description, { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?span=this-year-and-last-1$/);
});

test('Net cash flow has a bar per period, the current one partial, each opening its Drill-down', async ({
  page,
}) => {
  const { description } = await seedSalary(Date.now());
  const flow = region(page, 'Net cash flow');
  const partial = (label: string) =>
    flow.getByRole('link', { name: new RegExp(`^${label} \\(partial\\): `) });

  await page.goto('/analytics?span=this-year-and-last-1');
  await expect(partial(formatPeriod(QUARTER))).toBeVisible();
  // Its best and weakest quarters, or heaviest and lightest when every quarter loses money.
  await expect(flow.getByText(/^(Weakest|Lightest) quarter: /)).toBeVisible();

  await page.goto('/analytics?span=this-year-and-last-4');
  await expect(partial(YEAR)).toBeVisible();
  // At most one bar per period: the Span's 5 years.
  expect(await flow.getByRole('link', { name: /^\d{4}( \(partial\))?: / }).count()).toBe(5);

  // On a wide screen it sits beside Account balances, on the left.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/analytics');
  const flowBox = (await flow.boundingBox())!;
  const balancesBox = (await region(page, 'Account balances in CHF').boundingBox())!;
  expect(flowBox.y).toBe(balancesBox.y);
  expect(flowBox.x + flowBox.width).toBeLessThan(balancesBox.x);

  await partial(CURRENT_MONTH).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?span=rolling-12-months$/);
});

test('on a wide screen Net worth, Spending Insights and Recent transactions share the first row', async ({
  page,
}) => {
  await seedSalary(Date.now());
  // The overview row's three cards, once each has loaded.
  const recent = region(page, 'Recent transactions');
  const cards = recent.locator('xpath=..').locator(':scope > section');
  const boxes = async () => {
    await expect(cards).toHaveCount(3);
    await expect(cards.and(page.locator('[aria-busy="true"]'))).toHaveCount(0);
    return Promise.all([0, 1, 2].map(async (i) => (await cards.nth(i).boundingBox())!));
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/analytics');
  await expect(cards.first()).toHaveAccessibleName('Your net worth today');
  const [netWorth, insights, recentBox] = await boxes();
  expect(insights!.y).toBe(netWorth!.y);
  expect(recentBox!.y).toBe(netWorth!.y);
  expect(netWorth!.x + netWorth!.width).toBeLessThan(insights!.x);
  expect(insights!.x + insights!.width).toBeLessThan(recentBox!.x);

  // One column on a phone, in the same order.
  await page.setViewportSize({ width: 390, height: 900 });
  const [narrowWorth, narrowInsights, narrowRecent] = await boxes();
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
  const notes = page.getByText(/left out: no FX rate yet\./);
  const keyFigures = region(page, 'Key figures');
  const keyFigureNote = (name: string) =>
    keyFigures.getByRole('region', { name, exact: true }).getByText(/left out: no FX rate yet\./);
  // The left-out Account weighs on Net worth, its expense on Expense and Profit; Income is whole.
  for (const name of ['Net worth', 'Expense', 'Profit']) {
    await expect(keyFigureNote(name)).toBeVisible();
  }
  await expect(keyFigureNote('Income')).toHaveCount(0);
  for (const name of [
    'Your net worth today',
    'Net cash flow',
    'Account balances in CHF',
    'Spending by Category',
    'Income vs. expense',
    'Categories per period',
  ]) {
    await expect(region(page, name).getByText(/left out: no FX rate yet\./)).toBeVisible();
  }
  // Spending Insights too, whether it draws its insight or says why it can't yet.
  // And the three Key figures it weighs on.
  await expect(notes).toHaveCount(7 + 3);
});
