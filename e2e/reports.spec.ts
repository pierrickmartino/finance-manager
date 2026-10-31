import path from 'node:path';
import { expect, test } from '@playwright/test';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

test('builds a month × Category pivot, drills into a cell and saves it as a Widget', async ({
  page,
}) => {
  // An Account of its own, so the report can be filtered to it in the shared E2E database.
  const name = `Reports ${Date.now()}`;
  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(`${name} bank`);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: `${name} bank` })).toBeVisible();
  await page.goto('/accounts');
  const newAccount = page.getByRole('region', { name: 'New Account' });
  await newAccount.getByLabel('Bank').selectOption({ label: `${name} bank` });
  await newAccount.getByLabel('Account name').fill(name);
  await newAccount.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await newAccount.getByRole('button', { name: 'Add Account' }).click();
  await page.getByRole('row').filter({ hasText: name }).getByRole('link').click();
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: /Commit import/ }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Build the pivot: October 2025, month × Category, this Account only.
  await page.getByRole('link', { name: 'Reports' }).click();
  await page.getByRole('link', { name: 'New Widget' }).click();
  const form = page.getByRole('form', { name: 'Widget query' });
  await form.getByRole('combobox', { name: 'Range', exact: true }).selectOption('fixed');
  await form.getByLabel('From').fill('2025-10-01');
  await form.getByLabel('To', { exact: true }).fill('2025-10-31');
  await form.getByLabel('Rows').selectOption({ label: 'Month' });
  await form.getByLabel('Columns').selectOption({ label: 'Category' });
  await form.getByLabel('Accounts').selectOption({ label: `${name} bank · ${name}` });
  await form.getByRole('button', { name: 'Show report' }).click();

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

  // Back to the report, and save it as a standalone Widget.
  await page.getByRole('link', { name: 'Back to the report' }).click();
  const widgetName = `October by Category ${Date.now()}`;
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();
  await expect(page.getByRole('heading', { level: 1, name: widgetName })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Pivot' }).getByRole('rowheader', { name: 'Oct 2025' }),
  ).toBeVisible();
});
