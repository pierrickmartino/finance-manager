import path from 'node:path';
import { expect, test } from '@playwright/test';

const CA_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/credit-agricole/ca-eur-2025-10.ofx',
);

test('imports a Crédit Agricole OFX and proposes the opening balance derived from LEDGERBAL', async ({
  page,
}) => {
  // Shared E2E database: unique names, and no IBAN (IBANs are unique across the run).
  const suffix = Date.now();
  const bankName = `Crédit Agricole ${suffix}`;
  const accountName = `CA compte courant ${suffix}`;

  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  await page.goto('/accounts');
  const form = page.getByRole('region', { name: 'New Account' });
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByLabel('Currency').selectOption('EUR');
  await form.getByLabel('Import format').selectOption({ label: 'Crédit Agricole OFX' });
  await form.getByRole('button', { name: 'Add Account' }).click();
  await page.getByRole('row').filter({ hasText: accountName }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  await page.getByLabel('Bank file (Crédit Agricole OFX)').setInputFiles(CA_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible();
  await expect(page.getByText('Reconciled: the balances in the file add up.')).toBeVisible();
  await expect(page.getByText('Opening balance (derived from the closing balance)')).toBeVisible();
  const entries = page.getByRole('table', { name: 'Entries' }).locator('tbody tr');
  await expect(entries).toHaveCount(7);
  await expect(entries.filter({ hasText: '2510270000006' })).toContainText(
    'COTISATION OFFRE COMPTE À COMPOS',
  );
  await expect(page.getByLabel(/Use EUR 980.67 on 01.10.2025/)).toBeChecked();

  await page.getByRole('button', { name: 'Commit import (7 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(page.getByText("Balance EUR 1'342.17")).toBeVisible();
});
