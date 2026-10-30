import path from 'node:path';
import { expect, test } from '@playwright/test';

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
  await expect(page.getByRole('region', { name: 'Group Capital' })).toBeVisible();
  await expect(page.getByLabel('Name of Credit card (unitemised)')).toBeVisible();
  const newGroup = page.getByRole('form', { name: 'New Category group' });
  await newGroup.getByLabel('Group name').fill(groupName);
  await newGroup.getByLabel('Type').selectOption({ label: 'Expense' });
  await newGroup.getByRole('button', { name: 'Add group' }).click();
  const group = page.getByRole('region', { name: `Group ${groupName}` });
  await group.getByRole('textbox', { name: `New Category in ${groupName}` }).fill(categoryName);
  await group.getByRole('button', { name: 'Add Category' }).click();
  await expect(group.getByLabel(`Name of ${categoryName}`)).toBeVisible();

  // An imported Transaction to classify
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
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Unclassified');
  await rows.first().getByRole('link').click();

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
});
