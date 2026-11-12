import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { createWidget } from '../src/server/services/reporting';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { openAccountPage, openNewAccountForm } from './support/accounts';
import { withServices } from './support/services';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

test('builds a month × Category pivot, drills into a cell and saves it as a Widget', async ({
  page,
}) => {
  // An Account of its own, so the Widget can be filtered to it in the shared E2E database.
  const name = `Widgets ${Date.now()}`;
  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(`${name} bank`);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: `${name} bank` })).toBeVisible();
  const newAccount = await openNewAccountForm(page);
  await newAccount.getByLabel('Bank').selectOption({ label: `${name} bank` });
  await newAccount.getByLabel('Account name').fill(name);
  await newAccount.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await newAccount.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, name);
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: /Commit import/ }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Build the pivot: October 2025, month × Category, this Account only.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'More' })
    .click();
  await page.getByRole('link', { name: 'Widgets' }).click();
  await page.getByRole('link', { name: 'New Widget' }).click();
  const form = page.getByRole('form', { name: 'Widget query' });
  await form.getByRole('combobox', { name: 'Range', exact: true }).selectOption('fixed');
  await form.getByLabel('From').fill('2025-10-01');
  await form.getByLabel('To', { exact: true }).fill('2025-10-31');
  await form.getByLabel('Rows').selectOption({ label: 'Month' });
  await form.getByLabel('Columns').selectOption({ label: 'Category' });
  await form.locator('summary', { hasText: 'Filters' }).click();
  await form.locator('summary', { hasText: 'Accounts' }).click();
  await form.getByRole('checkbox', { name: `${name} bank · ${name}` }).check();
  // No Preview button: the preview follows every change.
  await expect(page).toHaveURL(/[?&]account=/);

  // The preview opens on the Dashboard card; the pivot behind it is under Data.
  await page.getByRole('tab', { name: 'Data' }).click();
  const pivot = page.getByRole('table', { name: 'Pivot' });
  await expect(pivot.getByRole('columnheader', { name: 'Unclassified' })).toBeVisible();
  await expect(pivot.getByRole('rowheader', { name: 'Oct 2025' })).toBeVisible();

  // The full-screen pivot view, and back.
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeVisible();

  // Drill into the cell: all 14 October Transactions are unclassified.
  await pivot.getByRole('link', { name: /^Oct 2025, Unclassified: / }).click();
  await expect(
    page.getByRole('heading', { name: 'Transactions in Oct 2025 · Unclassified' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('14 Transactions');
  await expect(
    page.getByRole('table', { name: 'Cell Transactions' }).locator('tbody tr'),
  ).toHaveCount(14);

  // Back to the editor, and save it as a standalone Widget.
  await page.getByRole('link', { name: 'Back to the editor' }).click();
  const widgetName = `October by Category ${Date.now()}`;
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();
  await expect(page.getByRole('heading', { level: 1, name: widgetName })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Pivot' }).getByRole('rowheader', { name: 'Oct 2025' }),
  ).toBeVisible();
});

test("a Donut Widget's legend row opens the Drill-down behind its amount", async ({ page }) => {
  const suffix = Date.now();
  const widgetName = `Legend ${suffix}`;
  const widgetId = await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Legend bank ${suffix}` });
    const account = (name: string) =>
      createAccount(ctx, {
        bankId: bank.id,
        name,
        currency: 'CHF',
        iban: null,
        kind: 'current',
        importFormat: null,
        openingBalanceMinor: 0,
      });
    const rent = await account(`Rent ${suffix}`);
    const food = await account(`Food ${suffix}`);
    const today = swissToday();
    for (const [accountId, amountMinor] of [
      [rent.id, -75_000],
      [food.id, -25_000],
    ] as const) {
      await createManualTransaction(ctx, {
        accountId,
        bookingDate: addDays(today, -3),
        amountMinor,
        description: `Legend spend ${suffix}`,
      });
    }
    const widget = await createWidget(ctx, {
      name: widgetName,
      query: {
        dateRange: { kind: 'fixed', from: addDays(today, -10), to: today },
        rows: 'account',
        columns: null,
        filters: { accountIds: [rent.id, food.id] },
      },
      visualisation: 'donut',
    });
    return widget.id;
  });

  await page.goto(`/widgets/${widgetId}`);
  const legend = page.getByRole('list', { name: `${widgetName} legend` });
  const foodRow = legend.getByRole('link', { name: new RegExp(`Food ${suffix}`) });
  await expect(foodRow).toContainText('CHF -250.00');

  // From the keyboard: focus the row and follow it.
  await foodRow.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/widgets\/drill\?/);
  await expect(page.getByRole('main')).toContainText('CHF -250.00');
  await expect(
    page.getByRole('table', { name: 'Cell Transactions' }).locator('tbody tr'),
  ).toHaveCount(1);
});

test('old Reports links redirect to the Widgets pages, keeping the query', async ({ page }) => {
  await page.goto('/reports');
  await expect(page).toHaveURL(/\/widgets$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Widgets' })).toBeVisible();

  await page.goto('/reports/builder?rows=month');
  await expect(page).toHaveURL(/\/widgets\/new\?rows=month$/);
});
