import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openAccountPage, openNewAccountForm } from './support/accounts';

const BCGE_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/bcge/bcge-chf-2025-10.xml',
);

test('imports a BCGE CAMT.053 file with a bundled entry shown as one Transaction', async ({
  page,
}) => {
  // Shared E2E database: unique names, and no IBAN (IBANs are unique across the run).
  const suffix = Date.now();
  const bankName = `BCGE ${suffix}`;
  const accountName = `BCGE current ${suffix}`;

  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByLabel('Import format').selectOption({ label: 'BCGE CAMT.053' });
  await form.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, accountName);
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  await page.getByLabel('Bank file (BCGE CAMT.053)').setInputFiles(BCGE_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible();
  await expect(page.getByText('Reconciled: the balances in the file add up.')).toBeVisible();

  // 8 booked entries; the pending one is left out
  const entries = page.getByRole('table', { name: 'Entries' }).locator('tbody tr');
  await expect(entries).toHaveCount(8);
  const bundled = entries.filter({ hasText: 'BCGE20251002000117' });
  await expect(bundled).toContainText("-1'187.35");
  await bundled.getByText('3 bundled payments').click();
  const details = bundled.getByRole('list', { name: 'Bundled payments' }).getByRole('listitem');
  await expect(details).toHaveCount(3);
  await expect(details.nth(2)).toContainText('Garderie Les Exemples');
  await expect(details.nth(2)).toContainText('-655.00');

  await page.getByRole('button', { name: 'Commit import (8 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(page.getByText("Balance CHF 16'908.15")).toBeVisible();
});
