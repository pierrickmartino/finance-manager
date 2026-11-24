import { expect, test, type Page } from '@playwright/test';
import { periodDates } from '../src/lib/analytics/period';
import {
  columns,
  heatmapRow,
  LAST_YEAR,
  MONTH,
  periodControl,
  QUARTERS,
  region,
  seedGrocery,
  seedOldPurchase,
  seedPurchase,
  seedSalary,
  STARTS,
  TODAY,
  YEAR,
} from './support/analytics';

/**
 * Analytics' Card Periods (spec #205, ADR-0018): each pinnable Card's Period dropdown and its
 * mark, pins kept as the page's Period moves, through a Drill-down and back, until Same as page.
 */

/** Analytics' search parameters, as the page reads them. */
const searchOf = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

/** A Card's Period dropdown, named for the Card. */
const cardPeriod = (page: Page, name: string) =>
  region(page, name).getByLabel(`Period for ${name}`, { exact: true });

const cardPeriodMark = (page: Page, name: string) =>
  region(page, name).getByTestId('card-period-mark');

test("pinning Spending by Category reads it over its own Period, which it keeps when the page's changes, through a Drill-down and back, until Same as page", async ({
  page,
}) => {
  const suffix = Date.now();
  const { description, group } = await seedPurchase(suffix);
  await seedOldPurchase(suffix, `Spending account ${suffix}`);
  const name = 'Spending by Category';
  const section = region(page, name);
  const picker = cardPeriod(page, name);

  // Unpinned: it follows the page's Period, by month, and shows no mark.
  await page.goto('/analytics?period=rolling-90-days');
  await expect(section.getByText('Furniture leads')).toBeVisible();
  await expect(picker).toHaveValue('');
  await expect(cardPeriodMark(page, name)).toHaveCount(0);
  await expect(section.getByText(/^Monthly average$/)).toBeVisible();

  // Pinned by keyboard: read by quarter over Since last year, its preset marked; the rest of
  // the page still reads Last 90 days.
  await picker.focus();
  await picker.selectOption('this-year-and-last-1');
  await expect
    .poll(() => searchOf(page))
    .toEqual({ period: 'rolling-90-days', 'spending-by-category': 'this-year-and-last-1' });
  await expect(cardPeriodMark(page, name)).toHaveText(`Pinned to Since ${LAST_YEAR}`);
  await expect(section.getByText(/^Quarterly average$/)).toBeVisible();
  await expect(section.getByText(/^Heaviest quarter: /)).toBeVisible();
  await expect(
    region(page, 'Key figures')
      .getByRole('region', { name: 'Income', exact: true })
      .getByText('Last 90 days', { exact: true }),
  ).toBeVisible();
  expect((await columns(page, 'Profit per interval')).length).toBeLessThanOrEqual(5);

  // A pick equal to the page's Period is a pin too, and the page's Period moving leaves it be.
  await periodControl(page).getByLabel('Period', { exact: true }).selectOption('year-to-date');
  await expect
    .poll(() => searchOf(page))
    .toEqual({ period: 'year-to-date', 'spending-by-category': 'this-year-and-last-1' });
  await expect(picker).toHaveValue('this-year-and-last-1');
  await expect(section.getByText(/^Quarterly average$/)).toBeVisible();

  // A Category's Drill-down, and back to the page with its Period and the pin.
  await section.getByRole('link', { name: new RegExp(`^Furniture\\s*${group}`) }).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*originSpendingByCategory=this-year-and-last-1/);
  await expect(
    page
      .getByRole('table', { name: 'Drill-down Transactions' })
      .getByText(description, { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect
    .poll(() => searchOf(page))
    .toEqual({ period: 'year-to-date', 'spending-by-category': 'this-year-and-last-1' });
  await expect(cardPeriodMark(page, name)).toBeVisible();

  // Same as page: the pin and its mark go, and the Card reads the page's Period again.
  await picker.selectOption({ value: '' });
  await expect.poll(() => searchOf(page)).toEqual({ period: 'year-to-date' });
  await expect(cardPeriodMark(page, name)).toHaveCount(0);
  await expect(section.getByText(/^Monthly average$|^Heaviest month: /).first()).toBeVisible();
});

test("on a phone a pinned Card's Period dropdown and mark fit its header", async ({ page }) => {
  const suffix = Date.now();
  await seedPurchase(suffix);
  await seedOldPurchase(suffix, `Spending account ${suffix}`);
  const name = 'Spending by Category';
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/analytics?period=rolling-90-days&spending-by-category=this-year-and-last-4');
  const section = region(page, name);
  await expect(cardPeriodMark(page, name)).toBeVisible();

  const card = (await section.boundingBox())!;
  for (const part of [cardPeriod(page, name), cardPeriodMark(page, name)]) {
    const box = (await part.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
  }
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
});

test('a hand-edited pin on a Card without a dropdown, or an invalid one, is ignored', async ({
  page,
}) => {
  const suffix = Date.now();
  await seedPurchase(suffix);
  await seedOldPurchase(suffix, `Spending account ${suffix}`);
  const name = 'Spending by Category';

  await page.goto('/analytics?from=2024-03-01&key-figures=year-to-date&spending-by-category=week');
  await expect(region(page, name).getByText('Furniture leads')).toBeVisible();
  await expect(cardPeriod(page, name)).toHaveValue('');
  await expect(cardPeriodMark(page, name)).toHaveCount(0);
  await expect(region(page, 'Key figures').getByLabel(/^Period for /)).toHaveCount(0);
});

test('pinning Categories per interval reads it by year while the page reads months, and Net cash flow and Profit per interval pin beside it', async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  await seedOldPurchase(suffix);
  const name = 'Categories per interval';
  const picker = cardPeriod(page, name);
  const group = heatmapRow(page, name, `Pay ${suffix}`);
  const partialYear = new RegExp(`^Pay ${suffix}, ${YEAR} \\(partial\\): `);
  const allPinned = {
    period: 'rolling-90-days',
    'net-cash-flow': 'this-year-and-last-1',
    'profit-per-interval': 'this-year-and-last-1',
    'categories-per-interval': 'this-year-and-last-4',
  };

  // Unpinned: by month, as the page's Last 90 days, and no mark.
  await page.goto('/analytics?period=rolling-90-days');
  await expect(group).toBeVisible();
  await expect(picker).toHaveValue('');
  await expect(cardPeriodMark(page, name)).toHaveCount(0);
  expect((await columns(page, name)).length).toBeLessThanOrEqual(5);

  // Pinned to Since four years ago: five years, this one to date; the page still reads months.
  await picker.selectOption('this-year-and-last-4');
  await expect
    .poll(() => searchOf(page))
    .toEqual({ period: 'rolling-90-days', 'categories-per-interval': 'this-year-and-last-4' });
  await expect(cardPeriodMark(page, name)).toHaveText(`Pinned to Since ${Number(YEAR) - 4}`);
  await expect(group.getByRole('link', { name: partialYear })).toBeVisible();
  expect(await columns(page, name)).toHaveLength(6);
  expect((await columns(page, 'Profit per interval')).length).toBeLessThanOrEqual(5);

  // Net cash flow and Profit per interval pin too, by quarter, each keeping the other pins.
  await cardPeriod(page, 'Net cash flow').selectOption('this-year-and-last-1');
  await expect
    .poll(() => searchOf(page))
    .toEqual({
      period: 'rolling-90-days',
      'net-cash-flow': 'this-year-and-last-1',
      'categories-per-interval': 'this-year-and-last-4',
    });
  await expect(cardPeriodMark(page, 'Net cash flow')).toHaveText(`Pinned to Since ${LAST_YEAR}`);
  await expect(region(page, 'Net cash flow').getByText(/^Quarterly average$/)).toBeVisible();
  await cardPeriod(page, 'Profit per interval').selectOption('this-year-and-last-1');
  await expect.poll(() => searchOf(page)).toEqual(allPinned);
  await expect(cardPeriodMark(page, 'Profit per interval')).toBeVisible();
  await expect
    .poll(async () => (await columns(page, 'Profit per interval')).length)
    .toBe(QUARTERS + 1);

  // The current year's subtotal opens its Transactions, and the way back keeps every pin.
  await group.getByRole('link', { name: partialYear }).click();
  await expect(page).toHaveURL(
    /\/widgets\/drill\?.*originCategoriesPerInterval=this-year-and-last-4/,
  );
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByText(description),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect.poll(() => searchOf(page)).toEqual(allPinned);
  await expect(cardPeriodMark(page, name)).toBeVisible();

  // Same as page: back to months, its mark gone, the other pins kept.
  await picker.selectOption({ value: '' });
  const { 'categories-per-interval': _unpinned, ...others } = allPinned;
  await expect.poll(() => searchOf(page)).toEqual(others);
  await expect(cardPeriodMark(page, name)).toHaveCount(0);
  await expect.poll(async () => (await columns(page, name)).length).toBeLessThanOrEqual(5);
});

test("pinning Net worth runs its line and change from its own Period's start, the Key figures still reading the page's, until Same as page", async ({
  page,
}) => {
  const suffix = Date.now();
  await seedSalary(suffix);
  await seedGrocery(suffix);
  await seedOldPurchase(suffix);
  const name = 'Net worth';
  const netWorth = region(page, 'Your net worth today');
  const picker = netWorth.getByLabel(`Period for ${name}`, { exact: true });
  const mark = netWorth.getByTestId('card-period-mark');
  const start = STARTS['year-to-date'];
  const startLabel = periodDates({ from: start, to: start });
  const trendOver = (from: string) =>
    netWorth.getByRole('group', { name: `Net worth, ${periodDates({ from, to: TODAY })}` });
  const change = netWorth
    .getByRole('list', { name: 'Change in Net worth' })
    .getByRole('link')
    .first();

  // Unpinned: it follows the page's Period and shows no mark.
  await page.goto('/analytics?period=rolling-90-days');
  await expect(trendOver(STARTS['rolling-90-days'])).toBeVisible();
  await expect(picker).toHaveValue('');
  await expect(mark).toHaveCount(0);

  // Pinned to Year to date: its line from the year's first day, a point per month to today, and
  // its change since that day.
  await picker.selectOption('year-to-date');
  await expect
    .poll(() => searchOf(page))
    .toEqual({ period: 'rolling-90-days', 'net-worth': 'year-to-date' });
  await expect(mark).toHaveText('Pinned to Year to date');
  const trend = trendOver(start);
  await expect(trend.getByRole('link')).toHaveCount(Number(MONTH) + 1);
  await expect(trend.getByRole('link').first()).toHaveAccessibleName(
    new RegExp(`^${startLabel}: `),
  );
  await expect(change).toHaveAccessibleName(
    new RegExp(`^Period: .* since the start of ${startLabel}$`),
  );
  await expect(netWorth.getByText(/profit over \d+ month/)).toBeVisible();
  // The Key figures still read Last 90 days.
  await expect(
    region(page, 'Key figures')
      .getByRole('region', { name: 'Income', exact: true })
      .getByText('Last 90 days', { exact: true }),
  ).toBeVisible();

  // Its change opens the Accounts as of the day before its start; back, the pin is kept.
  await change.click();
  await expect(page).toHaveURL(new RegExp(`/accounts\\?date=${LAST_YEAR}-12-31$`));
  await page.goBack();
  await expect(mark).toHaveText('Pinned to Year to date');

  // Same as page: the pin and its mark go, and the line reads the page's Period again.
  await picker.selectOption({ value: '' });
  await expect.poll(() => searchOf(page)).toEqual({ period: 'rolling-90-days' });
  await expect(mark).toHaveCount(0);
  await expect(trendOver(STARTS['rolling-90-days'])).toBeVisible();
});

test("pinning Profit and loss compares it with its own Comparison period, the Key figures' changes unmoved, through a Drill-down and back, until Same as page", async ({
  page,
}) => {
  const suffix = Date.now();
  const { description } = await seedSalary(suffix);
  await seedOldPurchase(suffix);
  const name = 'Profit and loss';
  const statement = region(page, name);
  const picker = cardPeriod(page, name);
  const statementRow = (row: string) =>
    statement
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${row}`) }) });
  const statementChange = (row: string) => statementRow(row).getByRole('link', { name: / vs / });
  const keyFigureChange = (figure: string) =>
    region(page, 'Key figures')
      .getByRole('region', { name: figure, exact: true })
      .getByRole('link', { name: / vs / });
  const nameOf = async (link: ReturnType<Page['getByRole']>) =>
    (await link.getAttribute('aria-label'))!;

  // Unpinned: it shares the Key figures' comparison and shows no mark.
  await page.goto('/analytics?period=rolling-90-days');
  await expect(statementChange('Income')).toBeVisible();
  await expect(picker).toHaveValue('');
  await expect(cardPeriodMark(page, name)).toHaveCount(0);
  const unpinned = await nameOf(statementChange('Income'));
  const keyFigures = await Promise.all(
    ['Income', 'Expense', 'Profit'].map(keyFigureChange).map(nameOf),
  );
  expect(unpinned).toBe(keyFigures[0]);

  // Pinned to Year to date: compared with the same stretch of last year, the Key figures still
  // compared over Last 90 days.
  await picker.focus();
  await picker.selectOption('year-to-date');
  await expect
    .poll(() => searchOf(page))
    .toEqual({ period: 'rolling-90-days', 'profit-and-loss': 'year-to-date' });
  await expect(cardPeriodMark(page, name)).toHaveText('Pinned to Year to date');
  for (const row of ['Income', 'Expense', 'Profit', 'Net cash flow']) {
    await expect(statementChange(row)).toHaveAccessibleName(
      new RegExp(` vs 1 Jan( – \\d+ \\w+)? ${LAST_YEAR}$`),
    );
  }
  expect(
    await Promise.all(['Income', 'Expense', 'Profit'].map(keyFigureChange).map(nameOf)),
  ).toEqual(keyFigures);

  // The page's Period moving leaves the pin be.
  await periodControl(page).getByLabel('Period', { exact: true }).selectOption('rolling-30-days');
  await expect
    .poll(() => searchOf(page))
    .toEqual({ period: 'rolling-30-days', 'profit-and-loss': 'year-to-date' });
  await expect(picker).toHaveValue('year-to-date');
  await expect(statementChange('Income')).toHaveAccessibleName(
    new RegExp(` vs 1 Jan( – \\d+ \\w+)? ${LAST_YEAR}$`),
  );

  // Income's Drill-down over Year to date, and back to the page with its Period and the pin.
  await statementRow('Income')
    .getByRole('link', { name: /^Income: / })
    .click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*originProfitAndLoss=year-to-date/);
  await expect(
    page
      .getByRole('table', { name: 'Drill-down Transactions' })
      .getByText(description, { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to Analytics' }).click();
  await expect
    .poll(() => searchOf(page))
    .toEqual({ period: 'rolling-30-days', 'profit-and-loss': 'year-to-date' });
  await expect(cardPeriodMark(page, name)).toBeVisible();

  // Same as page: the pin and its mark go, and it shares the Key figures' comparison again.
  await picker.selectOption({ value: '' });
  await expect.poll(() => searchOf(page)).toEqual({ period: 'rolling-30-days' });
  await expect(cardPeriodMark(page, name)).toHaveCount(0);
  await expect(statementChange('Income')).toHaveAccessibleName(
    await nameOf(keyFigureChange('Income')),
  );
});
