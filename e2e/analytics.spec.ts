import { expect, test } from '@playwright/test';
import { DEFAULT_PERIOD, periodDates, periodPhrase } from '../src/lib/analytics/period';
import { formatPeriod } from '../src/lib/format';
import { createAccount, listAccounts } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { leadFontSize } from './support/card-layout';
import { withServices } from './support/services';
import {
  columns,
  CURRENT_MONTH,
  heatmap,
  heatmapRow,
  LAST_YEAR,
  MONTH,
  monthsAgo,
  periodControl,
  QUARTER,
  QUARTERS,
  region,
  ROLLING_MONTHS,
  ROLLING_START,
  seedGrocery,
  seedOldPurchase,
  seedPurchase,
  seedSalary,
  STARTS,
  TODAY,
  YEAR,
} from './support/analytics';

/**
 * Analytics (spec #170, #204): the Period control, and each section drawn as the Dashboard's own
 * card: Net worth, Spending Insights, Recent transactions, Income vs. expense, Account balances
 * in CHF, Spending by Category, Net cash flow, and the Profit per interval and Categories per
 * interval heatmaps.
 * Each Card's own Period is card-period.spec.ts.
 */

test('/ lands on Analytics over Last 12 months, its dates in words', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
  const control = periodControl(page);
  await expect(control.getByLabel('Period', { exact: true })).toHaveValue('rolling-12-months');
  await expect(control.getByLabel('From', { exact: true })).toHaveValue(ROLLING_START);
  await expect(
    control.getByText(periodPhrase(DEFAULT_PERIOD, { from: ROLLING_START, to: TODAY })),
  ).toBeVisible();
});

test('picking a Period preset fills in its date, reads every section over it, and a Drill-down returns to it', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  await seedOldPurchase(suffix);
  const control = periodControl(page);
  const preset = control.getByLabel('Period', { exact: true });
  const name = 'Profit per interval';
  const income = region(page, 'Key figures').getByRole('region', { name: 'Income', exact: true });
  const incomeCaption = (period: string) => income.getByText(period, { exact: true });

  // Last 12 months: a month each, the first cut short (unless it starts on the 1st) and the
  // current one starred as running, then Total.
  await page.goto('/analytics');
  await expect(heatmap(page, name)).toBeVisible();
  let headers = await columns(page, name);
  expect(headers).toHaveLength(ROLLING_MONTHS + 1);
  expect(headers.slice(-2)).toEqual([`${CURRENT_MONTH.split(' ')[0]}*`, 'Total']);
  expect(headers[0]!.endsWith('*')).toBe(ROLLING_MONTHS === 13);
  for (const row of ['Income', 'Expense', 'Capital', 'Profit', 'Net cash flow']) {
    await expect(
      heatmap(page, name).getByRole('rowheader', { name: row, exact: true }),
    ).toBeVisible();
  }
  // Profit and loss: the whole Period's statement, just before Profit per interval (a row's name
  // may carry its note on what other tests' data leaves out).
  for (const row of ['Income', 'Expense', 'Profit', 'Capital', 'Net cash flow']) {
    await expect(
      region(page, 'Profit and loss').getByRole('rowheader', { name: new RegExp(`^${row}`) }),
    ).toBeVisible();
  }

  // Since last year: by quarter, from 1 January last year.
  await preset.selectOption('this-year-and-last-1');
  await expect(page).toHaveURL(/\/analytics\?period=this-year-and-last-1$/);
  await expect(control.getByLabel('From', { exact: true })).toHaveValue(`${LAST_YEAR}-01-01`);
  await expect(
    heatmap(page, name)
      .getByRole('columnheader')
      .nth(QUARTERS - 1),
  ).toHaveText(`${formatPeriod(QUARTER)}*`);
  headers = await columns(page, name);
  expect(headers).toHaveLength(QUARTERS + 1);
  await expect(incomeCaption(`Since ${LAST_YEAR}`)).toBeVisible();

  // Since four years ago: by year, the first four years before this one.
  await preset.selectOption('this-year-and-last-4');
  await expect(page).toHaveURL(/\/analytics\?period=this-year-and-last-4$/);
  await expect(heatmap(page, name).getByRole('columnheader').nth(4)).toHaveText(`${YEAR}*`);
  headers = await columns(page, name);
  expect(headers).toHaveLength(5 + 1);
  expect(headers[0]).toBe(String(Number(YEAR) - 4));
  await expect(incomeCaption(`Since ${Number(YEAR) - 4}`)).toBeVisible();
  await expect(
    region(page, 'Net cash flow').getByRole('link', {
      name: new RegExp(`^${YEAR} \\(partial\\): `),
    }),
  ).toBeVisible();

  // A reload keeps the Period.
  await page.reload();
  await expect(preset).toHaveValue('this-year-and-last-4');

  // The current year's income opens the Transactions behind it, with a way back to the Period.
  await heatmap(page, name)
    .getByRole('link', { name: new RegExp(`^Income, ${YEAR} \\(partial\\): `) })
    .click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=this-year-and-last-4$/);
  await expect(preset).toHaveValue('this-year-and-last-4');
});

test('typing a start date switches the Period to Custom, reads every section from it, and a Drill-down returns to it', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  // So the typed date is never before the first Transaction (and stays as typed).
  await seedOldPurchase(suffix);
  const from = monthsAgo(2);
  const atFrom = new RegExp(`/analytics\\?from=${from}$`);
  const control = periodControl(page);
  const preset = control.getByLabel('Period', { exact: true });
  const date = control.getByLabel('From', { exact: true });
  const name = 'Profit per interval';

  await page.goto('/analytics');
  await date.fill(from);
  await expect(preset).toHaveValue('custom');
  await control.getByRole('button', { name: 'Show' }).click();

  await expect(page).toHaveURL(atFrom);
  await expect(preset).toHaveValue('custom');
  await expect(date).toHaveValue(from);
  await expect(
    control.getByText(periodPhrase({ kind: 'custom', from }, { from, to: TODAY })),
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

  // The current month's income opens the Transactions behind it, with a way back to the Period.
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
  await expect(page).toHaveURL(/\/analytics\?period=year-to-date$/);
  await expect(date).toHaveValue(`${YEAR}-01-01`);
});

test('a former Period view link redirects to its nearest Period', async ({ page }) => {
  for (const [view, period] of [
    ['month', 'rolling-12-months'],
    ['quarter', 'this-year-and-last-1'],
    ['year', 'this-year-and-last-4'],
  ] as const) {
    await page.goto(`/analytics?period=${view}`);
    await expect(page).toHaveURL(new RegExp(`/analytics\\?period=${period}$`));
    await expect(periodControl(page).getByLabel('Period', { exact: true })).toHaveValue(period);
  }
});

test('a former Span link redirects to the same Period preset', async ({ page }) => {
  await page.goto('/analytics?span=year-to-date');
  await expect(page).toHaveURL(/\/analytics\?period=year-to-date$/);
  await expect(periodControl(page).getByLabel('Period', { exact: true })).toHaveValue(
    'year-to-date',
  );
});

test('Spending Insights judges the last complete month whatever the Period and opens its Transactions', async ({
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
  await seedOldPurchase(suffix, `Insights account ${suffix}`);
  // Income too: the insight reads income against expense, so it needs both.
  await seedSalary(suffix);

  // Last 30 days holds no complete month, yet the insight still speaks of the last one.
  await page.goto('/analytics?period=rolling-30-days');
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
  await expect(page).toHaveURL(/\/analytics\?period=rolling-30-days$/);
});

test('on a phone the Period control stays at the top and the heatmap scrolls inside its card', async ({
  page,
}) => {
  const suffix = Date.now();
  await seedSalary(suffix);
  await seedOldPurchase(suffix);
  // Short, so the page scrolls past the control with one section.
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto('/analytics');
  await expect(heatmap(page, 'Profit per interval')).toBeVisible();

  const control = periodControl(page);
  const top = (await control.boundingBox())!.y;
  await page.evaluate((by) => window.scrollTo(0, by), top + 20);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top);
  await expect.poll(async () => (await control.boundingBox())?.y).toBe(0);

  // The page never scrolls sideways: the heatmap does, inside its card.
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
  for (const name of ['Profit per interval', 'Categories per interval']) {
    const scroller = region(page, name).locator('figure');
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
  }
});

test("Net worth reads today, with a point at the Period's start, each interval end and today, and its change since the start", async ({
  page,
}) => {
  const suffix = Date.now();
  await seedSalary(suffix);
  // An expense beside the income, so the tile draws its flow (Came in, Went out, Profit).
  await seedGrocery(suffix);
  await seedOldPurchase(suffix);
  const netWorth = region(page, 'Your net worth today');

  for (const [period, intervals, current] of [
    ['rolling-12-months', ROLLING_MONTHS, CURRENT_MONTH],
    ['this-year-and-last-1', QUARTERS, formatPeriod(QUARTER)],
    ['this-year-and-last-4', 5, YEAR],
  ] as const) {
    // Labelled with the Period's first day: it stands at its start.
    const startLabel = periodDates({ from: STARTS[period], to: STARTS[period] });
    await page.goto(`/analytics?period=${period}`);
    const trend = netWorth.getByRole('group', {
      name: `Net worth, ${periodDates({ from: STARTS[period], to: TODAY })}`,
    });
    // The start (Net worth at the end of the day before the Period's first), then a point per interval.
    await expect(trend.getByRole('link')).toHaveCount(intervals + 1);
    await expect(trend.getByRole('link').first()).toHaveAccessibleName(
      new RegExp(`^${startLabel}: `),
    );
    await expect(trend.getByRole('link').last()).toHaveAccessibleName(new RegExp(`^${current}: `));
    await expect(
      netWorth.getByRole('list', { name: 'Change in Net worth' }).getByRole('link').first(),
    ).toHaveAccessibleName(new RegExp(`^Period: .* since the start of ${startLabel}$`));
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
  await seedOldPurchase(suffix);
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
    await expect(tile.getByText('Last 12 months', { exact: true })).toBeVisible();
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
    await expect(page).toHaveURL(/\/analytics\?period=rolling-12-months$/);
  }
  await amountOf(2).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  // Expense lists what went out today, and not the salary that came in.
  const drilled = page.getByRole('table', { name: 'Drill-down Transactions' });
  await expect(drilled.getByText(grocery)).toBeVisible();
  await expect(drilled.getByText(description)).toHaveCount(0);

  // Net worth stays today's whatever the Period, and opens the Accounts as of today.
  await page.goto('/analytics?period=this-year-and-last-4');
  await expect(tiles[0]!.getByText('Today', { exact: true })).toBeVisible();
  await expect(tiles[1]!.getByText(`Since ${Number(YEAR) - 4}`, { exact: true })).toBeVisible();
  await amountOf(0).click();
  await expect(page).toHaveURL(new RegExp(`/accounts\\?date=${swissToday()}$`));
});

test("a Key figure's change line opens both stretches of days, and Net worth's the Accounts then", async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  // The day before Last 12 months starts: the last day of its Comparison period.
  const beforePeriod = addDays(ROLLING_START, -1);
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
      bookingDate: beforePeriod,
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
  // The 365 days before the Period, which end last year.
  await expect(changeOf('Income')).toHaveAccessibleName(
    new RegExp(
      `^(Up|Down|Unchanged) .*vs \\d+ \\w+( \\d{4})? – \\d+ \\w+ ${beforePeriod.slice(0, 4)}`,
    ),
  );

  // Profit's change opens both stretches of both: today's salary and the earlier groceries.
  await changeOf('Profit').click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  const table = page.getByRole('table', { name: 'Drill-down Transactions' });
  await expect(table.getByText(description)).toBeVisible();
  await expect(table.getByText(earlier)).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=rolling-12-months$/);

  const lastMonthEnd = new Date(Date.UTC(Number(YEAR), Number(MONTH) - 1, 0))
    .toISOString()
    .slice(0, 10);
  await changeOf('Net worth').click();
  await expect(page).toHaveURL(new RegExp(`/accounts\\?date=${lastMonthEnd}$`));
});

test('each Key figure carries a sparkline, hidden from assistive technology, that fits its tile', async ({
  page,
}) => {
  const suffix = Date.now();
  await seedSalary(suffix);
  await seedOldPurchase(suffix);
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
      // The current interval is partial: a dashed last segment to a hollow dot.
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

test('Categories per interval lists each Category beside its group subtotal, and both open their Drill-down', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  const name = 'Categories per interval';

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
  await expect(page).toHaveURL(/\/analytics\?period=rolling-12-months$/);

  // So does the Category's Total, the row's last figure.
  await category.getByRole('link').last().click();
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
});

test('Recent transactions and Account balances stay the same whatever the Period and open their pages', async ({
  page,
}) => {
  const { description, account } = await seedSalary(Date.now());
  const recent = region(page, 'Recent transactions');
  const balances = region(page, 'Account balances in CHF');
  // The opening 1'000.00 and today's salary of 4'321.00.
  const balance = balances.getByRole('link', { name: new RegExp(`^${account}.*5\\D?321`) });

  for (const period of ['rolling-30-days', 'this-year-and-last-1', 'this-year-and-last-4']) {
    await page.goto(`/analytics?period=${period}`);
    await expect(recent.getByRole('link', { name: new RegExp(description) })).toBeVisible();
    await expect(balance).toBeVisible();
  }

  await recent.getByRole('link', { name: new RegExp(description) }).click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}/);

  await page.goto('/analytics');
  await balance.click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]{36}/);
});

test('Spending by Category ranks the largest Categories and a Category opens its Drill-down', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description, group } = await seedPurchase(suffix);
  await seedOldPurchase(suffix, `Spending account ${suffix}`);

  await page.goto('/analytics?period=this-year-and-last-1');
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
  await expect(page).toHaveURL(/\/analytics\?period=this-year-and-last-1$/);
});

test('Net cash flow has a bar per interval, the current one partial, each opening its Drill-down', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  await seedOldPurchase(suffix);
  const flow = region(page, 'Net cash flow');
  const partial = (label: string) =>
    flow.getByRole('link', { name: new RegExp(`^${label} \\(partial\\): `) });

  await page.goto('/analytics?period=this-year-and-last-1');
  await expect(partial(formatPeriod(QUARTER))).toBeVisible();
  // Its best and weakest quarters, or heaviest and lightest when every quarter loses money.
  await expect(flow.getByText(/^(Weakest|Lightest) quarter: /)).toBeVisible();

  await page.goto('/analytics?period=this-year-and-last-4');
  await expect(partial(YEAR)).toBeVisible();
  // At most one bar per interval: the Period's 5 years.
  expect(await flow.getByRole('link', { name: /^\d{4}( \(partial\))?: / }).count()).toBe(5);

  // On a wide screen it sits beside Profit and loss, on the right.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/analytics');
  // Both stream in after the page: measure them once drawn.
  const statement = region(page, 'Profit and loss');
  await expect(partial(CURRENT_MONTH)).toBeVisible();
  await expect(statement.getByRole('table')).toBeVisible();
  const flowBox = (await flow.boundingBox())!;
  const statementBox = (await statement.boundingBox())!;
  expect(flowBox.y).toBe(statementBox.y);
  expect(statementBox.x + statementBox.width).toBeLessThan(flowBox.x);

  await partial(CURRENT_MONTH).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=analytics/);
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=rolling-12-months$/);
});

/** An amount as the page writes it ("CHF 4'234", "CHF -87.00") as a number of francs. */
const francs = (text: string): number => Number(text.replace(/[^\d.-]/g, ''));

test("Income vs. expense draws the Period day by day as running totals, and a day's income or expense opens the Transactions that sum to it", async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  await seedGrocery(suffix);
  await seedOldPurchase(suffix);
  const card = region(page, 'Income vs. expense');
  const plot = card.getByRole('group', { name: /^Income and expense, \d+ points from / });
  // What the plot says of its active point, for assistive technology.
  const active = card.locator('p[aria-live="polite"]');
  const keptOf = async () => francs((await active.innerText()).split('Kept so far ')[1]!);
  const figuresOf = async () => {
    const [, income, expense] = /Income (.+), Expense (.+), Kept so far /.exec(
      await active.innerText(),
    )!;
    return { income: francs(income!), expense: francs(expense!) };
  };
  const status = page.getByRole('status');
  const drillTotal = async () => Math.round(francs((await status.innerText()).split('total ')[1]!));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/analytics');
  // Always by day: one point per day of Last 12 months, today to date.
  const days = (Date.parse(TODAY) - Date.parse(ROLLING_START)) / 86_400_000 + 1;
  await expect(plot).toHaveAccessibleName(
    new RegExp(`^Income and expense, ${days} points from .+ \\(to date\\)\\.`),
  );
  await expect(card.getByText('Kept so far', { exact: true })).toBeVisible();
  for (const fact of ['Came in', 'Went out']) {
    await expect(card.getByRole('term').filter({ hasText: fact })).toBeVisible();
  }
  const lead = card.getByTestId('card-lead').getByRole('link');
  const kept = francs(await lead.innerText());

  // In the top row, on the left of Account balances.
  const balances = region(page, 'Account balances in CHF');
  await expect(balances).not.toHaveAttribute('aria-busy', 'true');
  const cardBox = (await card.boundingBox())!;
  const balancesBox = (await balances.boundingBox())!;
  expect(cardBox.y).toBe(balancesBox.y);
  expect(cardBox.x + cardBox.width).toBeLessThan(balancesBox.x);

  // Hovering a day shows its running figures; clicking near the top of the plot, above the
  // lower line, opens the higher area's column through that day, which sums to its point. The
  // days are about a pixel apart: the right edge (below its rounded corner) is today, and the
  // click stays where the hover was.
  await plot.scrollIntoViewIfNeeded();
  const box = (await plot.boundingBox())!;
  await page.mouse.move(box.x + box.width - 0.4, box.y + 10);
  await expect(active).toHaveText(/\(to date\): Income .+, Expense .+, Kept so far /);
  const hovered = await figuresOf();
  const isIncomeHigher = hovered.income >= hovered.expense;
  await page.mouse.down();
  await page.mouse.up();
  await expect(page).toHaveURL(
    new RegExp(`/widgets/drill\\?.*rowThrough=.*column=${isIncomeHigher ? 'income' : 'expense'}`),
  );
  await expect(status).toHaveText(/Transactions?, total CHF /);
  expect(await drillTotal()).toBe(isIncomeHigher ? hovered.income : -hovered.expense);
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=rolling-12-months$/);

  // The keyboard reaches today's point: what was kept so far, the card's lead.
  await plot.focus();
  await plot.press('End');
  await expect(active).toHaveText(/\(to date\): Income .+, Expense .+, Kept so far /);
  expect(await keptOf()).toBe(kept);
  // Enter moves to its figures, one link per column: Expense opens what went out through it.
  const today = await figuresOf();
  await plot.press('Enter');
  await expect(card.getByRole('link', { name: /^Income, .+ \(to date\): / })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(card.getByRole('link', { name: /^Expense, .+ \(to date\): / })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/widgets\/drill\?.*rowThrough=.*column=expense/);
  await expect(status).toHaveText(/Transactions?, total CHF /);
  // Expense is negative in the Drill-down: the point is what went out.
  expect(await drillTotal()).toBe(-today.expense);
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics\?period=rolling-12-months$/);

  // Its lead opens the whole Period's income and expense, the salary among them.
  await lead.click();
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  expect(await drillTotal()).toBe(kept);
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
  const suffix = Date.now();
  // Converted figures beside the left-out ones, over a Period reaching back to its start.
  await seedSalary(suffix);
  await seedOldPurchase(suffix);
  await seedUnconverted(suffix);
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
    'Income vs. expense',
    'Net cash flow',
    'Account balances in CHF',
    'Spending by Category',
    'Profit per interval',
    'Categories per interval',
  ]) {
    await expect(region(page, name).getByText(/left out: no FX rate yet\./)).toBeVisible();
  }
  // Profit and loss flags the rows it weighs on: Expense, Profit and Net cash flow.
  const statement = region(page, 'Profit and loss');
  for (const row of ['Expense', 'Profit', 'Net cash flow']) {
    await expect(
      statement
        .getByRole('rowheader', { name: new RegExp(`^${row}`) })
        .getByText(/left out: no FX rate yet\./),
    ).toBeVisible();
  }
  // Spending Insights too, whether it draws its insight or says why it can't yet.
  // And the three Key figures and three Profit and loss rows it weighs on.
  await expect(notes).toHaveCount(8 + 3 + 3);
});

test('on a wide screen the third-width sections draw their lead a size down, from their own width', async ({
  page,
}) => {
  const suffix = Date.now();
  await seedSalary(suffix);
  await seedGrocery(suffix);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/analytics');
  // About 355px inside at 1280, under the Card's lead threshold (28rem): the smaller size.
  for (const name of [
    'Income vs. expense',
    'Account balances in CHF',
    'Spending by Category',
    'Net cash flow',
  ]) {
    await expect(region(page, name).getByTestId('card-lead')).toBeVisible();
    expect(await leadFontSize(region(page, name))).toBe('20px');
  }
});
