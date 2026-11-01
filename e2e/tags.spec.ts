import path from 'node:path';
import { expect, test } from '@playwright/test';
import { accountDetail, openAccountPage, openNewAccountForm } from './support/accounts';
import { addExpenseCategory } from './support/categories';
import { addTag } from './support/tags';
import { openTransaction } from './support/transactions';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

test('manages Tags as master / detail, with each Tag’s totals and latest Transactions', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: every name below is unique to this test.
  const suffix = Date.now().toString(36);
  const bankName = `Tags bank ${suffix}`;
  const accountName = `Tags account ${suffix}`;
  const groupName = `Tags group ${suffix}`;
  const categoryName = `Phone ${suffix}`;
  const telecom = `Telco ${suffix}`;
  const work = `Work ${suffix}`;
  const unused = `Unused ${suffix}`;
  page.on('dialog', (dialog) => void dialog.accept());

  await addExpenseCategory(page, groupName, categoryName);
  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();
  const accountForm = await openNewAccountForm(page);
  await accountForm.getByLabel('Bank').selectOption({ label: bankName });
  await accountForm.getByLabel('Account name').fill(accountName);
  await accountForm.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await accountForm.getByRole('button', { name: 'Add Account' }).click();
  await expect(accountDetail(page, accountName)).toBeVisible();
  await openAccountPage(page, accountName);
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Commit import (14 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  // Tag an imported Transaction (a new Tag is created as it is typed)
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
  await classification.getByLabel('Category').selectOption({ label: categoryName });
  await classification.getByLabel('Tags').fill(telecom);
  await classification.getByRole('button', { name: 'Save classification' }).click();
  await expect(page.getByRole('list', { name: 'Locked fields' })).toBeVisible();

  // The filter narrows the list; picking a Tag shows its totals, Categories and Transactions
  await page.goto('/tags');
  const list = page.getByRole('navigation', { name: 'Tags' });
  await list.getByLabel('Filter Tags').fill(suffix);
  await list.getByLabel('Filter Tags').press('Enter');
  await expect(page).toHaveURL(/q=/);
  await list.getByRole('link', { name: new RegExp(telecom) }).click();
  await expect(list.getByRole('link', { name: new RegExp(telecom) })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const telecomPane = page.getByRole('region', { name: `Tag ${telecom}` });
  await expect(telecomPane.getByRole('link', { name: '1 Transaction' })).toBeVisible();
  await expect(telecomPane.getByText('Net CHF')).toBeVisible();
  await expect(
    telecomPane.getByRole('list', { name: `Top Categories of ${telecom}` }),
  ).toContainText(`${categoryName} · 1`);
  await expect(
    telecomPane
      .getByRole('list', { name: `Recent Transactions of ${telecom}` })
      .getByRole('listitem'),
  ).toHaveCount(1);

  // A new Tag opens straight away; it has no Transactions yet
  await addTag(page, work);
  await expect(page).toHaveURL(/\?tag=/);
  await expect(page.getByRole('region', { name: `Tag ${work}` })).toContainText('Unused');

  // Merging moves the Transactions and opens the Tag merged into
  await page.goto('/tags?q=' + suffix);
  await list.getByRole('link', { name: new RegExp(telecom) }).click();
  await telecomPane.getByText('Edit Tag', { exact: true }).click();
  await telecomPane.getByLabel(`Merge ${telecom} into`).selectOption({ label: work });
  await telecomPane.getByRole('button', { name: 'Merge' }).click();
  const workPane = page.getByRole('region', { name: `Tag ${work}` });
  await expect(workPane.getByRole('link', { name: '1 Transaction' })).toBeVisible();
  await expect(list.getByRole('link', { name: new RegExp(telecom) })).toHaveCount(0);

  // Rename from the menu
  await workPane.getByText('Edit Tag', { exact: true }).click();
  await workPane.getByLabel(`Name of ${work}`).fill(`${work} trips`);
  await workPane.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('region', { name: `Tag ${work} trips` })).toBeVisible();
  await page.keyboard.press('Escape');

  // Delete from the menu
  await addTag(page, unused);
  const unusedPane = page.getByRole('region', { name: `Tag ${unused}` });
  await unusedPane.getByText('Edit Tag', { exact: true }).click();
  await unusedPane.getByRole('button', { name: 'Delete Tag' }).click();
  await expect(page.getByRole('region', { name: `Tag ${unused}` })).toHaveCount(0);
  await expect(list.getByRole('link', { name: new RegExp(unused) })).toHaveCount(0);
});
