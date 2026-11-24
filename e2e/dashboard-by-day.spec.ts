import { expect, test, type Page } from '@playwright/test';
import { formatPeriod } from '../src/lib/format';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { addWidget, createDashboard } from '../src/server/services/dashboards';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { withServices } from './support/services';

/**
 * Widgets by Day on a Dashboard (#272, #274; ADR-0020): a table and a line Widget by Day draw
 * one row per day, and a line flow by Day draws two areas of running totals whose days open
 * their column's Drill-down.
 */

const TODAY = swissToday();
/** Ten days through today: the salary on the fifth, the rent on the seventh. */
const FROM = addDays(TODAY, -9);
const SALARY_DAY = addDays(TODAY, -5);
const RENT_DAY = addDays(TODAY, -3);

/** An amount as the page writes it ("CHF 5'000", "CHF -1'200.00") as a number of francs. */
const francs = (text: string): number => Number(text.replace(/[^\d.-]/g, ''));

/** A short unique suffix: a long one would widen a phone's page with an unbreakable name. */
const shortSuffix = (): number => Date.now() % 100_000;

/**
 * A Dashboard with the Widgets given, over an Account of its own holding a salary (income)
 * and a rent payment (expense) within the last ten days, each Widget narrowed to that Account.
 */
async function seedDashboard(
  suffix: number,
  widgets: { name: string; visualisation: 'table' | 'line'; columns: 'categoryGroupType' | null }[],
): Promise<string> {
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `By-day bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `By-day account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    const pay = await createCategoryGroup(ctx, { name: `By-day pay ${suffix}`, type: 'income' });
    const home = await createCategoryGroup(ctx, { name: `By-day home ${suffix}`, type: 'expense' });
    const seeded = [
      { day: SALARY_DAY, amountMinor: 5000_00, groupId: pay.id, name: 'Salary' },
      { day: RENT_DAY, amountMinor: -1200_00, groupId: home.id, name: 'Rent' },
    ];
    for (const { day, amountMinor, groupId, name } of seeded) {
      const category = await createCategory(ctx, { groupId, name });
      const transaction = await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: day,
        amountMinor,
        description: `By-day ${name} ${suffix}`,
      });
      await editClassification(ctx, transaction.id, { categoryId: category.id });
    }
    const dashboard = await createDashboard(ctx, { name: `By day ${suffix}` });
    for (const { name, visualisation, columns } of widgets) {
      await addWidget(ctx, dashboard.id, {
        name,
        visualisation,
        query: {
          dateRange: { kind: 'fixed', from: FROM, to: TODAY },
          rows: 'day',
          columns,
          filters: { accountIds: [account.id], categoryGroupTypes: ['income', 'expense'] },
        },
      });
    }
    return dashboard.id;
  });
}

/** A Widget's card on the Story (not the overview's tile, which may take its name too). */
function card(page: Page, name: string) {
  return page
    .getByRole('region', { name, exact: true })
    .and(page.locator('[aria-labelledby^="card-"]'));
}

/** The plot of a line flow's card, and what it says of its active point. */
function flowPlot(page: Page, name: string) {
  const flow = card(page, name);
  return {
    plot: flow.getByRole('group', { name: /^Income and expense, \d+ points from / }),
    active: flow.locator('p[aria-live="polite"]'),
  };
}

test('a table and a line Widget by Day draw a row per day', async ({ page }) => {
  const suffix = shortSuffix();
  const dashboardId = await seedDashboard(suffix, [
    { name: 'Daily table', visualisation: 'table', columns: null },
    { name: 'Daily line', visualisation: 'line', columns: null },
  ]);

  await page.goto(`/dashboards/${dashboardId}`);
  // The table's heatmap: a row per day, the rent's day opening its one Transaction.
  const heatmap = card(page, 'Daily table').getByRole('table', { name: 'Heatmap' });
  await expect(heatmap.getByRole('rowheader')).toHaveCount(10);
  await expect(heatmap.getByRole('rowheader', { name: formatPeriod(TODAY) })).toBeVisible();
  const rent = heatmap.getByRole('row').filter({ hasText: formatPeriod(RENT_DAY) });
  await rent.getByRole('link', { name: /CHF -1'200\.00$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/widgets/drill\\?.*rows=day.*row=${RENT_DAY}`));
  await expect(page.getByRole('table', { name: 'Drill-down Transactions' })).toContainText(
    `By-day Rent ${suffix}`,
  );

  // The line by Day, one column: its best day is the salary's.
  await page.goBack();
  await expect(card(page, 'Daily line')).toContainText(`Best net day: ${formatPeriod(SALARY_DAY)}`);
});

test('a line flow Widget by Day draws two areas of running totals; a day opens its column', async ({
  page,
}) => {
  const suffix = shortSuffix();
  const dashboardId = await seedDashboard(suffix, [
    { name: 'Daily flow', visualisation: 'line', columns: 'categoryGroupType' },
  ]);
  const flow = card(page, 'Daily flow');
  const { plot, active } = flowPlot(page, 'Daily flow');
  const status = page.getByRole('status');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/dashboards/${dashboardId}`);
  await expect(plot).toHaveAccessibleName(/^Income and expense, 10 points from .+ \(to date\)\./);
  await expect(flow.getByText('Profit', { exact: true })).toBeVisible();
  expect(francs(await flow.getByTestId('card-lead').innerText())).toBe(3800);
  for (const series of ['Income', 'Expense']) {
    await expect(flow.locator('figcaption').getByText(series, { exact: true })).toBeVisible();
  }

  // Today's point: every day so far, so the whole range's income and expense.
  await plot.scrollIntoViewIfNeeded();
  const box = (await plot.boundingBox())!;
  await page.mouse.move(box.x + box.width - 1, box.y + 10);
  await expect(active).toHaveText(
    /\(to date\): Income CHF 5.000, Expense CHF 1.200, Profit CHF 3.800$/,
  );
  // Near the top, above the lower (expense) line: the income area.
  await page.mouse.down();
  await page.mouse.up();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*rowThrough=.*column=income/);
  await expect(status).toHaveText(/Transactions?, total CHF /);
  expect(Math.round(francs((await status.innerText()).split('total ')[1]!))).toBe(5000);
});

test('on a phone a line flow Widget by Day draws its areas across its card', async ({ page }) => {
  const suffix = shortSuffix();
  const dashboardId = await seedDashboard(suffix, [
    { name: 'Phone flow', visualisation: 'line', columns: 'categoryGroupType' },
  ]);
  const flow = card(page, 'Phone flow');
  const { plot } = flowPlot(page, 'Phone flow');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboards/${dashboardId}`);
  await plot.scrollIntoViewIfNeeded();
  await expect(plot).toBeVisible();
  await expect(flow.locator('figcaption')).toContainText('Income');
  // The plot spans the card, which holds it without scrolling sideways. (The card's width is
  // the page's: on a phone, other tests' long descriptions in Recent activity may widen it.)
  const box = (await plot.boundingBox())!;
  const cardBox = (await flow.boundingBox())!;
  expect(box.width).toBeGreaterThan(cardBox.width * 0.75);
  expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  expect(await flow.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
