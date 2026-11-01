import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openAccountPage, openNewAccountForm } from './support/accounts';
import { addCategory, addCategoryGroup } from './support/categories';
import { openTransaction } from './support/transactions';

const BCGE_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/bcge/bcge-chf-2025-10.xml',
);

test('splits a bundled CAMT entry from its pre-filled bundled payments', async ({ page }) => {
  // Shared E2E database: unique names, and no IBAN (IBANs are unique across the run).
  const suffix = Date.now();
  const bankName = `Split bank ${suffix}`;
  const accountName = `Split account ${suffix}`;
  const groupName = `Home ${suffix}`;
  const categories = [`Energy ${suffix}`, `Insurance ${suffix}`, `Childcare ${suffix}`];

  await page.goto('/categories');
  await addCategoryGroup(page, groupName, 'Expense');
  for (const category of categories) await addCategory(page, groupName, category);

  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();
  const accountForm = await openNewAccountForm(page);
  await accountForm.getByLabel('Bank').selectOption({ label: bankName });
  await accountForm.getByLabel('Account name').fill(accountName);
  await accountForm.getByLabel('Import format').selectOption({ label: 'BCGE CAMT.053' });
  await accountForm.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, accountName);
  await page.getByLabel('Bank file (BCGE CAMT.053)').setInputFiles(BCGE_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Commit import (8 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  // The bundled entry: one Transaction of three payments that add up to its amount
  const findBundled = async () => {
    await page.goto('/transactions');
    const search = page.getByRole('form', { name: 'Search Transactions' });
    await search.getByLabel('Account').selectOption({ label: accountName });
    await search.getByLabel('Search').fill('Ordre groupé');
    await search.getByRole('button', { name: 'Search' }).click();
    const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("-1'187.35");
    return rows.first();
  };
  await openTransaction(page, await findBundled());

  // The split form opens with one line per bundled payment, in the bank's order
  await page.getByText('Split Transaction').click();
  const form = page.getByRole('form', { name: 'Split' });
  await expect(form.getByLabel(/^Amount of line \d+$/)).toHaveCount(3);
  const expected = [
    ['-142.85', 'Services Industriels Exemple'],
    ['-389.50', 'Assurance Ménage Exemple SA'],
    ['-655.00', 'Garderie Les Exemples'],
  ];
  for (const [index, [amount, note]] of expected.entries()) {
    await expect(form.getByLabel(`Amount of line ${index + 1}`)).toHaveValue(amount!);
    await expect(form.getByLabel(`Note of line ${index + 1}`)).toHaveValue(note!);
  }
  await expect(form.getByTestId('split-remaining')).toHaveText('CHF 0.00');

  // The user only picks Categories and saves
  for (const [index, category] of categories.entries()) {
    await form.getByLabel(`Category of line ${index + 1}`).selectOption({ label: category });
  }
  await form.getByRole('button', { name: 'Save Split' }).click();
  await expect(page.getByRole('heading', { name: 'Split (3)' })).toBeVisible();
  const lines = page.getByRole('table', { name: 'Split lines' }).locator('tbody tr');
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(2)).toContainText(`${groupName} › ${categories[2]}`);
  await expect(lines.nth(2)).toContainText('Garderie Les Exemples');

  await expect(await findBundled()).toContainText('Split (3)');
});
