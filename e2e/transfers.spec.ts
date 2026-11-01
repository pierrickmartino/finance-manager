import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openTransaction } from './support/transactions';
import { openAccountPage, openNewAccountForm } from './support/accounts';

const FIXTURES = path.join(import.meta.dirname, '../test/fixtures/import');
const BCGE_OCTOBER = path.join(FIXTURES, 'bcge/bcge-chf-2025-10.xml');
const UBS_OCTOBER = path.join(FIXTURES, 'ubs/ubs-chf-2025-10.csv');

/** Creates a Bank and an Account with no IBAN (IBANs are unique across the shared E2E DB). */
async function createAccount(page: Page, name: string, format: string): Promise<void> {
  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(`${name} bank`);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: `${name} bank` })).toBeVisible();

  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: `${name} bank` });
  await form.getByLabel('Account name').fill(name);
  await form.getByLabel('Import format').selectOption({ label: format });
  await form.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, name);
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function preview(page: Page, format: string, file: string): Promise<void> {
  await page.getByLabel(`Bank file (${format})`).setInputFiles(file);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible();
}

test('confirms a Transfer candidate in the Import preview', async ({ page }) => {
  // BCGE CHF -2000.00 ↔ UBS +2000.00, both on 2025-10-10.
  const suffix = Date.now();
  const bcge = `BCGE savings ${suffix}`;
  const ubs = `UBS current ${suffix}`;

  await createAccount(page, bcge, 'BCGE CAMT.053');
  await preview(page, 'BCGE CAMT.053', BCGE_OCTOBER);
  await page.getByRole('button', { name: /Commit import/ }).click();
  await expect(page.getByRole('heading', { name: bcge })).toBeVisible();

  await createAccount(page, ubs, 'UBS CSV');
  await preview(page, 'UBS CSV', UBS_OCTOBER);
  const entry = page.getByRole('table', { name: 'Entries' }).getByRole('row', {
    name: /9930283TI0000105/,
  });
  await expect(entry).toContainText('Possible Transfer');
  const candidates = page.getByRole('group', { name: 'Transfer for 9930283TI0000105' });
  // No IBAN match here, so nothing is pre-selected: the user must choose.
  await expect(candidates.getByRole('radio', { name: 'Not a Transfer' })).toBeChecked();
  await candidates.getByRole('radio', { name: new RegExp(`Link with ${bcge}`) }).check();

  await page.getByRole('button', { name: /Commit import/ }).click();
  await expect(page.getByRole('heading', { name: ubs })).toBeVisible();
  const ubsId = new URL(page.url()).pathname.split('/').at(-1);

  await page.goto(`/transactions?transfer=only&accountId=${ubsId}`);
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Transfer');
  await openTransaction(page, rows.first());
  await expect(page.getByRole('region', { name: 'Transfer' })).toContainText(
    `Transfer with ${bcge}`,
  );
});
