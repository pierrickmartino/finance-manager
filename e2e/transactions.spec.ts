import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openTransaction } from './support/transactions';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

test('searches imported Transactions and opens one with its bank fields and History', async ({
  page,
}) => {
  // The E2E database is shared by the whole run (other tests import the same file), so every
  // search below is narrowed to this test's own Account.
  const suffix = Date.now();
  const bankName = `Transactions bank ${suffix}`;
  const accountName = `Transactions account ${suffix}`;

  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  await page.goto('/accounts');
  const form = page.getByRole('region', { name: 'New Account' });
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await form.getByRole('button', { name: 'Add Account' }).click();
  await page.getByRole('row').filter({ hasText: accountName }).getByRole('link').click();
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Commit import (14 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  // The Account's Transactions, newest first
  await page.getByRole('navigation').getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Account').selectOption({ label: accountName });
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('14 Transactions')).toBeVisible();
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(14);
  await expect(rows.first()).toContainText('31.10.2025');

  // Text ignores case and accents; amounts are typed in the user's number format
  await search.getByLabel('Search').fill('TELECOM exemple');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('-64.90');
  // The first row is previewed beside the list until another is picked
  const preview = page.getByRole('complementary', { name: 'Transaction preview' });
  await expect(preview).toContainText('-64.90');

  await search.getByLabel('Search').fill('');
  await search.getByLabel('Amount to').fill("-1'000.00");
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('2 Transactions')).toBeVisible();

  await search.getByLabel('Amount to').fill('lots');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Maximum amount must be an amount' }),
  ).toBeVisible();

  // Detail: bank fields read-only, the source Import, and the Transaction's History
  await search.getByLabel('Amount to').fill('');
  await search.getByLabel('Search').fill('telecom');
  await search.getByRole('button', { name: 'Search' }).click();
  await openTransaction(page, rows.first());
  const fields = page.getByRole('definition');
  await expect(page.getByRole('heading', { name: 'From the bank' })).toBeVisible();
  await expect(fields.filter({ hasText: 'CH2009000000087654321' })).toBeVisible();
  await expect(fields.filter({ hasText: '9930288TI0000107' })).toBeVisible();
  await expect(fields.filter({ hasText: 'Import of ubs-chf-2025-10.csv' })).toBeVisible();
  await expect(page.locator('dl[aria-label="Bank fields"]').getByRole('textbox')).toHaveCount(0);
  const history = page.getByRole('table', { name: 'Transaction History' }).locator('tbody tr');
  await expect(history.filter({ hasText: 'amountMinor' })).toContainText('import');
  await expect(history.filter({ hasText: 'bankReference' })).toContainText('9930288TI0000107');

  // Too narrow for the preview: a row opens its Transaction straight away
  const detailUrl = page.url();
  await page.goBack();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(preview).toBeHidden();
  await rows.first().getByRole('link').click();
  await expect(page).toHaveURL(detailUrl);
});
