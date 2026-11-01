import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openAccountPage, openNewAccountForm } from './support/accounts';

const UBS_DIR = path.join(import.meta.dirname, '../test/fixtures/import/ubs');
const UBS_OCTOBER = path.join(UBS_DIR, 'ubs-chf-2025-10.csv');
const UBS_MISSING_ROW = path.join(UBS_DIR, 'ubs-chf-2025-10-missing-row.csv');

test('uploads a UBS CSV, previews it, commits it, and skips it when uploaded again', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: use names no other test creates. The Account
  // has no IBAN, because IBANs are unique and a retry would create the Account again.
  const suffix = Date.now();
  const bankName = `UBS ${suffix}`;
  const accountName = `UBS current ${suffix}`;

  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await form.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, accountName);
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(page.getByText('No Imports yet.')).toBeVisible();

  // A broken file: the preview says where the gap is; discard it
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_MISSING_ROW);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Reconciliation failed' })).toContainText(
    'Running balance breaks between 9930287TI0000106 (14.10.2025) and 9930290TI0000108 (17.10.2025)',
  );
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(page.getByText('No Imports yet.')).toBeVisible();

  // Upload → preview
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible();
  await expect(page.getByText('Reconciled: the balances in the file add up.')).toBeVisible();
  const entries = page.getByRole('table', { name: 'Entries' }).locator('tbody tr');
  await expect(entries).toHaveCount(14);
  await expect(entries.filter({ hasText: '9930274TI0000101' })).toContainText("-2'150.00");
  await expect(page.getByLabel(/Use CHF 8'450.35 on 01.10.2025/)).toBeChecked();

  // Commit
  await page.getByRole('button', { name: 'Commit import (14 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(page.getByText("Balance CHF 12'903.05")).toBeVisible();
  const imports = page.getByRole('table', { name: 'Imports' }).locator('tbody tr');
  await expect(imports).toHaveCount(1);
  await expect(imports.first()).toContainText('ubs-chf-2025-10.csv');
  await expect(imports.first()).toContainText('Reconciled');

  // The same file again: everything is already imported
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByRole('button', { name: 'Commit import (0 new)' })).toBeVisible();
  await expect(entries.filter({ hasText: 'Already imported' })).toHaveCount(14);
});
