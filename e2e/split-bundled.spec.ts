import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openAccountPage, openNewAccountForm } from './support/accounts';
import { addCategory, addCategoryGroup } from './support/categories';
import { addPayee } from './support/payees';
import { openTransaction } from './support/transactions';

const BCGE_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/bcge/bcge-chf-2025-10.xml',
);

// Payee names can't take a suffix: they must match the fixture's counterparty names (#71).
const SERVICES_PAYEE = 'services industriels exemple';
const INSURANCE_PAYEE = 'Assurance Menage Exemple SA';

/** Adds a Payee unless the shared E2E database already has it (e.g. on a retry). */
async function ensurePayee(page: Page, name: string): Promise<void> {
  await page.goto('/payees');
  const listed = page.getByRole('navigation', { name: 'Payees' }).getByRole('listitem');
  if ((await listed.filter({ hasText: new RegExp(`^${name}`, 'i') }).count()) > 0) return;
  await addPayee(page, name);
}

test('splits a bundled CAMT entry from its pre-filled bundled payments', async ({ page }) => {
  // Shared E2E database: unique names, and no IBAN (IBANs are unique across the run).
  const suffix = Date.now();
  const bankName = `Split bank ${suffix}`;
  const accountName = `Split account ${suffix}`;
  const groupName = `Home ${suffix}`;
  const categories = [`Energy ${suffix}`, `Insurance ${suffix}`, `Childcare ${suffix}`];

  // Existing Payees named like two of the bundled payments' counterparties, ignoring case
  // and accents; the third payment has none, so its line takes the Transaction's Payee.
  await ensurePayee(page, SERVICES_PAYEE);
  await ensurePayee(page, INSURANCE_PAYEE);

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
    { amount: '-142.85', note: 'Services Industriels Exemple', payee: SERVICES_PAYEE },
    { amount: '-389.50', note: 'Assurance Ménage Exemple SA', payee: INSURANCE_PAYEE },
    { amount: '-655.00', note: 'Garderie Les Exemples', payee: null },
  ];
  for (const [index, { amount, note, payee }] of expected.entries()) {
    const number = index + 1;
    await expect(form.getByLabel(`Amount of line ${number}`)).toHaveValue(amount);
    await expect(form.getByLabel(`Note of line ${number}`)).toHaveValue(note);
    // The suggested Payee, or blank to take the Transaction's
    const payeePicker = form.getByLabel(`Payee of line ${number}`);
    if (payee === null) await expect(payeePicker).toHaveValue('');
    else
      await expect(payeePicker.locator('option:checked')).toHaveText(new RegExp(`^${payee}$`, 'i'));
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
  // The suggested Payees were saved as the lines' own; the unmatched line has none
  await expect(lines.nth(0)).toContainText(new RegExp(SERVICES_PAYEE, 'i'));
  await expect(lines.nth(1)).toContainText(new RegExp(INSURANCE_PAYEE, 'i'));
  await expect(lines.nth(2)).not.toContainText(new RegExp(SERVICES_PAYEE, 'i'));
  await expect(lines.nth(2)).not.toContainText(new RegExp(INSURANCE_PAYEE, 'i'));

  await expect(await findBundled()).toContainText('Split (3)');
});
