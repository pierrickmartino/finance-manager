import path from 'node:path';
import { expect, test } from '@playwright/test';
import { addCategory, addCategoryGroup } from './support/categories';
import { openTransaction } from './support/transactions';
import { openAccountPage, openNewAccountForm } from './support/accounts';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

test('categorises a Transaction from its detail view, locking and unlocking the edited fields', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: every name below is unique to this test.
  const suffix = Date.now();
  const bankName = `Classification bank ${suffix}`;
  const accountName = `Classification account ${suffix}`;
  const groupName = `Telecom ${suffix}`;
  const categoryName = `Mobile ${suffix}`;
  const payeeName = `Swisscom ${suffix}`;
  const tagName = `Household ${suffix}`;

  // The starter set is there, and the user adds a group and a Category of their own
  await page.goto('/categories');
  const groupList = page.getByRole('navigation', { name: 'Category groups' });
  await expect(groupList.getByRole('link', { name: 'Capital' })).toBeVisible();
  await groupList.getByRole('link', { name: 'Other expenses' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Group Other expenses' })
      .getByRole('listitem', { name: 'Credit card (unitemised)' }),
  ).toBeVisible();
  await addCategoryGroup(page, groupName, 'Expense');
  await addCategory(page, groupName, categoryName);

  // An imported Transaction to classify
  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();
  const accountForm = await openNewAccountForm(page);
  await accountForm.getByLabel('Bank').selectOption({ label: bankName });
  await accountForm.getByLabel('Account name').fill(accountName);
  await accountForm.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await accountForm.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, accountName);
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Commit import (14 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  await page.goto('/transactions');
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Account').selectOption({ label: accountName });
  await search.getByLabel('Search').fill('telecom');
  await search.getByRole('button', { name: 'Search' }).click();
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Unclassified');
  await openTransaction(page, rows.first());

  // Classify it
  const form = page.getByRole('form', { name: 'Classification' });
  await form.getByLabel('Payee').fill(payeeName);
  await form.getByLabel('Category').selectOption({ label: categoryName });
  await form.getByLabel('Tags').fill(tagName);
  await form.getByRole('button', { name: 'Save classification' }).click();
  const locked = page.getByRole('list', { name: 'Locked fields' });
  await expect(locked.getByRole('listitem')).toHaveText([/Payee/, /Category/, /Tags/]);
  const history = page.getByRole('table', { name: 'Transaction History' }).locator('tbody tr');
  await expect(history.filter({ hasText: `${groupName} › ${categoryName}` })).toContainText(
    'manual',
  );

  // Hand the Category back to the Rules: it keeps its value
  await page.getByRole('button', { name: 'Unlock Category' }).click();
  await expect(locked.getByRole('listitem')).toHaveText([/Payee/, /Tags/]);
  await expect(form.getByLabel('Category')).toHaveValue(/.+/);

  // The list shows it, and filters on it
  await page.goto('/transactions');
  await search.getByLabel('Category').selectOption({ label: categoryName });
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(payeeName);
  await expect(rows.first()).toContainText(categoryName);
  await expect(rows.first()).toContainText(tagName);

  // Deleting it from the detail view goes back to the list
  await openTransaction(page, rows.first());
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete Transaction' }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await search.getByLabel('Category').selectOption({ label: categoryName });
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('No Transactions match.')).toBeVisible();
});
