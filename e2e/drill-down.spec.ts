import { expect, test } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
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
    page.getByRole('table', { name: 'Cell Transactions' }).getByRole('columnheader', {
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

test('a forged origin falls back to the editor', async ({ page }) => {
  await page.goto('/widgets/drill?origin=https%3A%2F%2Fexample.com&originId=..%2F..%2Fsettings');

  await expect(page.getByRole('link', { name: 'Back to the editor' })).toHaveAttribute(
    'href',
    /^\/widgets\/new\?/,
  );
});
