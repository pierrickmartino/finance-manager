import { expect, test } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import {
  addWidget,
  createDashboard as createDashboardRecord,
} from '../src/server/services/dashboards';
import type { WidgetQueryInput } from '../src/server/services/reporting';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { widgetCard } from './support/dashboards';
import { withServices } from './support/services';

/**
 * A Dashboard of two Widgets over one Account's spending, -120.00 and -2'400.00 over the last
 * six months: its sum by Account and month (the overview's headline amount), and its average
 * per month (-2'520.00 over 6 months = -420.00).
 */
async function seedDashboard(suffix: number) {
  const dayBefore = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Drill bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Drill account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    for (const [days, amountMinor] of [
      [40, -120_00],
      [70, -2400_00],
    ] as const) {
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: dayBefore(days),
        amountMinor,
        description: `Drill ${days}`,
      });
    }
    const dashboard = await createDashboardRecord(ctx, { name: `Drill ${suffix}` });
    const query: Pick<WidgetQueryInput, 'dateRange' | 'filters'> = {
      dateRange: { kind: 'last', count: 6, unit: 'month' },
      filters: { accountIds: [account.id] },
    };
    await addWidget(ctx, dashboard.id, {
      name: 'Spend by month',
      visualisation: 'table',
      query: { ...query, rows: 'account', columns: 'month' },
    });
    await addWidget(ctx, dashboard.id, {
      name: 'Average spend',
      visualisation: 'table',
      query: { ...query, rows: 'account', columns: null, measure: 'average' },
    });
    return { dashboardId: dashboard.id, bankName: bank.name, accountName: account.name };
  });
}

test('the overview row and a Story card open Drill-downs whose headline is the number clicked', async ({
  page,
}) => {
  const suffix = Date.now();
  const { dashboardId, bankName, accountName } = await seedDashboard(suffix);

  // The overview's headline amount: the first Widget's total.
  await page.goto(`/dashboards/${dashboardId}`);
  await expect(page.locator('section[aria-labelledby="overview-headline"] a')).toContainText(
    "2'520",
  );
  await page.locator('section[aria-labelledby="overview-headline"] a').click();
  await expect(page).toHaveURL(/\/widgets\/drill\?.*origin=dashboard/);
  await expect(page.getByRole('status')).toHaveText("2 Transactions, total CHF -2'520.00");
  await expect(page.getByLabel('Filters')).toContainText(`Accounts: ${bankName} · ${accountName}`);
  await expect(page.getByLabel('Filters')).toContainText('Capital left out · Transfers left out');
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).getByRole('columnheader', {
      name: 'Counted (CHF)',
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to the Dashboard' }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboards/${dashboardId}$`));

  // The average card: its one cell, worked out as the sum over its months.
  const average = widgetCard(page, 'Average spend').getByRole('table', { name: 'Heatmap' });
  await average
    .getByRole('link', { name: /: CHF -420\.00$/ })
    .first()
    .click();
  await expect(page.getByRole('status')).toHaveText(
    "CHF -2'520.00 ÷ 6 months = CHF -420.00 / month",
  );
  await page.getByRole('link', { name: 'Back to the Dashboard' }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboards/${dashboardId}$`));
});

/** The 10th of the month `back` months before the current one (Swiss time). */
function inMonthBefore(back: number): string {
  const [year, month] = swissToday().split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-10`;
}

test('"Other" and the ring\'s total open the Transactions behind them', async ({ page }) => {
  const suffix = Date.now();
  const { dashboardId, widgetId } = await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Spread bank ${suffix}` });
    const accountIds: string[] = [];
    // Nine Accounts spending 100 to 900: the two smallest fold into "Other" (-300.00).
    for (let index = 1; index <= 9; index++) {
      const account = await createAccount(ctx, {
        bankId: bank.id,
        kind: 'current',
        importFormat: null,
        name: `Spread ${index} ${suffix}`,
        currency: 'CHF',
        openingBalanceMinor: 0,
        openingDate: '2021-01-01',
      });
      accountIds.push(account.id);
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: inMonthBefore(1),
        amountMinor: -index * 100_00,
        description: `Other spend ${index}`,
      });
    }
    const dashboard = await createDashboardRecord(ctx, { name: `Spread ${suffix}` });
    const widget = await addWidget(ctx, dashboard.id, {
      name: 'By Account',
      visualisation: 'donut',
      query: {
        dateRange: { kind: 'last', count: 3, unit: 'month' },
        rows: 'account',
        columns: null,
        filters: { accountIds },
      },
    });
    return { dashboardId: dashboard.id, widgetId: widget.id };
  });

  // The ring's legend on the Dashboard.
  await page.goto(`/dashboards/${dashboardId}`);
  const card = widgetCard(page, 'By Account');
  await card.getByRole('link', { name: /^Other CHF/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Transactions in Other');
  await expect(page.getByRole('status')).toHaveText('2 Transactions, total CHF -300.00');
  await page.getByRole('link', { name: 'Back to the Dashboard' }).click();

  // The total in the ring's hole: every Transaction in the ring.
  await card.getByRole('link', { name: /^Total/ }).click();
  await expect(page.getByRole('status')).toHaveText("9 Transactions, total CHF -4'500.00");

  // The donut's legend on the Widget's own page.
  await page.goto(`/widgets/${widgetId}`);
  await page
    .getByRole('list', { name: 'By Account legend' })
    .getByRole('link', { name: /^Other CHF/ })
    .click();
  await expect(page.getByRole('status')).toHaveText('2 Transactions, total CHF -300.00');
});

test("the insight opens the latest month, its change and the Story's kept per month", async ({
  page,
}) => {
  const suffix = Date.now();
  const dashboardId = await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Flow bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Flow ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    const income = await createCategoryGroup(ctx, { name: `In ${suffix}`, type: 'income' });
    const living = await createCategoryGroup(ctx, { name: `Out ${suffix}`, type: 'expense' });
    const salary = await createCategory(ctx, { groupId: income.id, name: 'Salary' });
    const rent = await createCategory(ctx, { groupId: living.id, name: 'Rent' });
    // Three full months in 5'000.00 each, out 1'000.00, 1'100.00 then 1'300.00: the latest is
    // 24% above the 1'050.00 average before; kept 11'600.00 over 3 months, 3'866.67 a month.
    for (const [back, expense] of [
      [3, -1000_00],
      [2, -1100_00],
      [1, -1300_00],
    ] as const) {
      for (const [amountMinor, category] of [
        [5000_00, salary],
        [expense, rent],
      ] as const) {
        const transaction = await createManualTransaction(ctx, {
          accountId: account.id,
          bookingDate: inMonthBefore(back),
          amountMinor,
          description: `Flow ${back}`,
        });
        await editClassification(ctx, transaction.id, { categoryId: category.id });
      }
    }
    const dashboard = await createDashboardRecord(ctx, { name: `Flow ${suffix}` });
    await addWidget(ctx, dashboard.id, {
      name: 'In and out',
      visualisation: 'stacked_bar',
      query: {
        dateRange: { kind: 'last', count: 3, unit: 'month' },
        rows: 'month',
        columns: 'categoryGroupType',
        filters: { accountIds: [account.id] },
      },
    });
    return dashboard.id;
  });

  await page.goto(`/dashboards/${dashboardId}`);
  const insight = page.locator('section[aria-labelledby="overview-insight"]');
  await insight.getByRole('link', { name: 'See the Transactions' }).click();
  await expect(page.getByRole('status')).toHaveText("2 Transactions, total CHF 3'700.00");
  await page.getByRole('link', { name: 'Back to the Dashboard' }).click();

  await insight.getByRole('link', { name: '24% above' }).click();
  await expect(page.getByRole('status')).toHaveText(
    /CHF 1'300\.00 · .* CHF 1'100\.00 · .* CHF 1'000\.00 · average before CHF 1'050\.00 → \+24%$/,
  );
  await expect(
    page.getByRole('table', { name: 'Drill-down Transactions' }).locator('tbody tr'),
  ).toHaveCount(3);
  await page.getByRole('link', { name: 'Back to the Dashboard' }).click();

  await widgetCard(page, 'In and out')
    .locator('div')
    .filter({ hasText: /^Kept per month, on average/ })
    .getByRole('link')
    .click();
  await expect(page.getByRole('status')).toHaveText(
    "CHF 11'600.00 ÷ 3 months = CHF 3'866.67 / month",
  );
});

test('a forged origin falls back to the editor', async ({ page }) => {
  await page.goto('/widgets/drill?origin=https%3A%2F%2Fexample.com&originId=..%2F..%2Fsettings');

  await expect(page.getByRole('link', { name: 'Back to the editor' })).toHaveAttribute(
    'href',
    /^\/widgets\/new\?/,
  );
});
