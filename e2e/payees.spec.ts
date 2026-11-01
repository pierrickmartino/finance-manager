import path from 'node:path';
import { expect, test } from '@playwright/test';
import { addPayee } from './support/payees';
import { openTransaction } from './support/transactions';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

test('manages Payees as master / detail, with each Payee’s latest Transactions', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: every name below is unique to this test.
  const suffix = Date.now().toString(36);
  const bankName = `Payees bank ${suffix}`;
  const accountName = `Payees account ${suffix}`;
  const telecom = `Telco ${suffix}`;
  const swisscom = `Swisscom ${suffix}`;
  const unused = `Unused ${suffix}`;
  page.on('dialog', (dialog) => dialog.accept());

  // An imported Transaction gets a new Payee from its detail view
  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();
  await page.goto('/accounts');
  const accountForm = page.getByRole('region', { name: 'New Account' });
  await accountForm.getByLabel('Bank').selectOption({ label: bankName });
  await accountForm.getByLabel('Account name').fill(accountName);
  await accountForm.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await accountForm.getByRole('button', { name: 'Add Account' }).click();
  await page.getByRole('row').filter({ hasText: accountName }).getByRole('link').click();
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Commit import (14 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  await page.goto('/transactions');
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Account').selectOption({ label: accountName });
  await search.getByLabel('Search').fill('telecom');
  await search.getByRole('button', { name: 'Search' }).click();
  await openTransaction(
    page,
    page.getByRole('table', { name: 'Transactions' }).locator('tbody tr').first(),
  );
  const classification = page.getByRole('form', { name: 'Classification' });
  await classification.getByLabel('Payee').fill(telecom);
  await classification.getByRole('button', { name: 'Save classification' }).click();
  await expect(page.getByRole('list', { name: 'Locked fields' })).toBeVisible();

  // The filter narrows the list; picking a Payee shows its latest Transactions
  await page.goto('/payees');
  const list = page.getByRole('navigation', { name: 'Payees' });
  await list.getByLabel('Filter Payees').fill(suffix);
  await list.getByLabel('Filter Payees').press('Enter');
  await expect(page).toHaveURL(/q=/);
  await expect(list.getByRole('link', { name: new RegExp(telecom) })).toBeVisible();
  await list.getByRole('link', { name: new RegExp(telecom) }).click();
  await expect(list.getByRole('link', { name: new RegExp(telecom) })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const telecomPane = page.getByRole('region', { name: `Payee ${telecom}` });
  await expect(telecomPane.getByRole('link', { name: '1 Transaction' })).toBeVisible();
  await expect(
    telecomPane
      .getByRole('list', { name: `Recent Transactions of ${telecom}` })
      .getByRole('listitem'),
  ).toHaveCount(1);

  // A new Payee opens straight away; it has no Transactions yet
  await addPayee(page, swisscom);
  await expect(page).toHaveURL(/\?payee=/);
  await expect(page.getByRole('region', { name: `Payee ${swisscom}` })).toContainText('Unused');

  // Merging moves the Transactions and opens the Payee merged into
  await page.goto('/payees?q=' + suffix);
  await list.getByRole('link', { name: new RegExp(telecom) }).click();
  await telecomPane.getByText('Edit Payee', { exact: true }).click();
  await telecomPane.getByLabel(`Merge ${telecom} into`).selectOption({ label: swisscom });
  await telecomPane.getByRole('button', { name: 'Merge' }).click();
  const swisscomPane = page.getByRole('region', { name: `Payee ${swisscom}` });
  await expect(swisscomPane.getByRole('link', { name: '1 Transaction' })).toBeVisible();
  await expect(list.getByRole('link', { name: new RegExp(telecom) })).toHaveCount(0);

  // Rename from the menu
  await swisscomPane.getByText('Edit Payee', { exact: true }).click();
  await swisscomPane.getByLabel(`Name of ${swisscom}`).fill(`${swisscom} AG`);
  await swisscomPane.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('region', { name: `Payee ${swisscom} AG` })).toBeVisible();
  await page.keyboard.press('Escape');

  // Only an unused Payee can be deleted
  await addPayee(page, unused);
  const unusedPane = page.getByRole('region', { name: `Payee ${unused}` });
  await unusedPane.getByText('Edit Payee', { exact: true }).click();
  await unusedPane.getByRole('button', { name: 'Delete Payee' }).click();
  await expect(page.getByRole('region', { name: `Payee ${unused}` })).toHaveCount(0);
  await expect(list.getByRole('link', { name: new RegExp(unused) })).toHaveCount(0);
});
