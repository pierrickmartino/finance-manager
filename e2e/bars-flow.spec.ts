import { expect, test } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import {
  addWidget,
  createDashboard as createDashboardRecord,
} from '../src/server/services/dashboards';
import { swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { widgetCard } from './support/dashboards';
import { withServices } from './support/services';

/** How many full months back the flow holds: more than the six the old bars showed. */
const MONTHS_BACK = 7;

/** The 15th of the month `back` months before today's (ISO date). */
function inMonthBefore(back: number): string {
  const [year, month] = swissToday().split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 - back, 15));
  return date.toISOString().slice(0, 10);
}

/**
 * A Dashboard with one bars flow over an Account: in 5'000.00 and out 1'000.00 + 10.00 per
 * month back, the latest full month out 1'700.00, and 10.00 out today in the running month.
 */
async function seedBarsFlow(suffix: number): Promise<string> {
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Bars flow bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Bars flow ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    const income = await createCategoryGroup(ctx, { name: `In ${suffix}`, type: 'income' });
    const living = await createCategoryGroup(ctx, { name: `Out ${suffix}`, type: 'expense' });
    const salary = await createCategory(ctx, { groupId: income.id, name: 'Salary' });
    const rent = await createCategory(ctx, { groupId: living.id, name: 'Rent' });
    const book = async (bookingDate: string, amountMinor: number, categoryId: string) => {
      const transaction = await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate,
        amountMinor,
        description: `Bars flow ${bookingDate}`,
      });
      await editClassification(ctx, transaction.id, { categoryId });
    };
    for (let back = 1; back <= MONTHS_BACK; back++) {
      await book(inMonthBefore(back), 5000_00, salary.id);
      await book(inMonthBefore(back), back === 1 ? -1700_00 : -(1000_00 + back * 10_00), rent.id);
    }
    await book(swissToday(), -10_00, rent.id);
    const dashboard = await createDashboardRecord(ctx, { name: `Bars flow ${suffix}` });
    await addWidget(ctx, dashboard.id, {
      name: 'In and out per month',
      visualisation: 'stacked_bar',
      query: {
        // The full months, then the running one to date (partial).
        dateRange: { kind: 'last', count: MONTHS_BACK, unit: 'month', includeCurrent: true },
        rows: 'month',
        columns: 'categoryGroupType',
        filters: { accountIds: [account.id] },
      },
    });
    return dashboard.id;
  });
}

test('a bars flow is drawn as grouped bars, every month a pair, the running one hatched, each bar opening its Drill-down', async ({
  page,
}) => {
  const dashboardId = await seedBarsFlow(Date.now());

  await page.goto(`/dashboards/${dashboardId}`);
  const card = widgetCard(page, 'In and out per month');

  await expect(card.getByRole('figure').getByText('Income', { exact: true })).toBeVisible();
  await expect(card.getByRole('figure').getByText('Expense', { exact: true })).toBeVisible();
  const expenseBars = card.getByRole('link', { name: /, Expense: / });
  expect(await expenseBars.count()).toBeGreaterThan(6);
  // The running month is partial: named so, and hatched.
  await expect(card.getByRole('link', { name: /\(partial\), Expense: / })).toHaveCount(1);
  await expect(card.locator('[data-partial] .bg-hatch').first()).toBeAttached();

  // Hovering a pair shows its figures.
  const latest = card.getByRole('link', { name: /, Expense: CHF\s?1.700$/ });
  await latest.hover();
  await expect(card.locator('figure dl').getByText(/CHF\s?1.700/)).toBeVisible();

  await latest.click();
  await expect(page.getByRole('status')).toHaveText("1 Transaction, total CHF -1'700.00");
});

test('at phone width a bars flow keeps every pair without a horizontal scroll', async ({
  page,
}) => {
  const dashboardId = await seedBarsFlow(Date.now());

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/dashboards/${dashboardId}`);
  const card = widgetCard(page, 'In and out per month');

  await expect(card.getByRole('link', { name: /\(partial\), Expense: / })).toBeVisible();
  expect(await card.getByRole('link', { name: /, Income: / }).count()).toBeGreaterThan(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});
