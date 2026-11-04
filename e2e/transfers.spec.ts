import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openTransaction } from './support/transactions';
import { openAccountPage, openNewAccountForm } from './support/accounts';
import { addCategory, addCategoryGroup } from './support/categories';

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

/** Creates a Bank and a manual Account, and adds one Manual transaction to it. */
async function manualAccountWith(
  page: Page,
  name: string,
  amount: string,
  description: string,
): Promise<void> {
  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(`${name} bank`);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: `${name} bank` })).toBeVisible();
  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: `${name} bank` });
  await form.getByLabel('Account name').fill(name);
  await form.getByLabel('Opening balance').fill('0');
  await form.getByLabel('Opening date').fill('2025-01-01');
  await form.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, name);

  const entry = page.getByRole('region', { name: 'Manual transactions' });
  await entry.getByLabel('Date').fill('2025-10-10');
  await entry.getByLabel('Amount (CHF)').fill(amount);
  await entry.getByLabel('Description').fill(description);
  await entry.getByLabel('Description').press('Enter');
  await expect(entry.getByRole('table', { name: 'Manual transactions' })).toContainText(
    description,
  );
}

/** Opens the one Transaction whose description is `description` from the list. */
async function openByDescription(page: Page, description: string) {
  await page.goto('/transactions');
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Search').fill(description);
  await search.getByRole('button', { name: 'Search' }).click();
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(1);
  return rows.first();
}

test('links one Split line of a Transaction with a Transaction on another Account', async ({
  page,
}) => {
  // ADR-0005: a BCGE -1,500 is -1,000 to UBS savings and -500 rent; UBS shows +1,000.
  const suffix = Date.now();
  const bcge = `BCGE aggregate ${suffix}`;
  const ubs = `UBS savings ${suffix}`;
  const debit = `Ordre groupé ${suffix}`;
  const credit = `Versement ${suffix}`;
  const group = `Housing ${suffix}`;
  const rent = `Rent ${suffix}`;
  const savings = `Savings ${suffix}`;
  await page.goto('/categories');
  await addCategoryGroup(page, group, 'Expense');
  await addCategory(page, group, rent);
  await addCategory(page, group, savings);
  await manualAccountWith(page, bcge, "-1'500", debit);
  await manualAccountWith(page, ubs, "1'000", credit);

  // Split the debit into -1,000 and -500
  await openTransaction(page, await openByDescription(page, debit));
  await page.getByText('Split Transaction').click();
  const form = page.getByRole('form', { name: 'Split' });
  await form.getByLabel('Amount of line 1').fill("-1'000");
  await form.getByLabel('Category of line 1').selectOption({ label: savings });
  await form.getByRole('button', { name: 'Add line' }).click();
  await form.getByLabel('Amount of line 2').fill('-500');
  await form.getByLabel('Category of line 2').selectOption({ label: rent });
  await form.getByRole('button', { name: 'Save Split' }).click();
  await expect(page.getByRole('heading', { name: 'Split (2)' })).toBeVisible();
  // Linked by its lines, not as a whole
  await expect(page.getByRole('region', { name: 'Transfer' })).toHaveCount(0);

  // Link the -1,000 line with the UBS +1,000
  const lines = page.getByRole('table', { name: 'Split lines' }).locator('tbody tr');
  await lines.nth(0).locator('summary', { hasText: 'Link as Transfer' }).click();
  const link = page.getByRole('form', { name: 'Link line 1 as Transfer' });
  await expect(link.getByLabel('Other side')).toContainText(ubs);
  await link.getByRole('button', { name: 'Link as Transfer' }).click();
  await expect(lines.nth(0)).toContainText(`Transfer with ${ubs}`);
  await expect(lines.nth(0)).not.toContainText(savings);
  await expect(lines.nth(1)).toContainText(`${group} › ${rent}`);
  await expect(page.getByText('Partly Transfer')).toBeVisible();

  // The other side links back to the line's Transaction
  await lines
    .nth(0)
    .getByRole('link', { name: new RegExp(ubs) })
    .click();
  const transfer = page.getByRole('region', { name: 'Transfer' });
  await expect(transfer).toContainText(`Transfer with a Split line of CHF -1'000.00 of ${bcge}`);
  await transfer.getByRole('link', { name: new RegExp(bcge) }).click();
  await expect(page.getByRole('heading', { name: 'Split (2)' })).toBeVisible();

  // Editing the Split keeps the Transfer: the linked line shows it, with no Category or Remove
  await page.getByText('Edit Split').click();
  await expect(form.getByTestId('transfer of line 1')).toContainText(`Transfer with ${ubs}`);
  await expect(form.getByLabel('Category of line 1')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Remove line 1' })).toHaveCount(0);
  await form.getByLabel('Note of line 1').fill('To savings');
  await form.getByLabel('Category of line 2').selectOption({ label: savings });
  await form.getByRole('button', { name: 'Save Split' }).click();
  await expect(form.getByText('Saved.')).toBeVisible();
  await expect(lines.nth(0)).toContainText(`Transfer with ${ubs}`);
  await expect(lines.nth(0)).toContainText('To savings');
  await expect(lines.nth(1)).toContainText(`${group} › ${savings}`);

  // The Split can't be removed while it holds the Transfer
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Remove Split' }).click();
  await expect(page.getByText('unlink the Transfer first')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Split (2)' })).toBeVisible();

  // The list shows the debit once, split, with the Partly Transfer badge
  const row = await openByDescription(page, debit);
  await expect(row).toContainText('Split (2)');
  await expect(row).toContainText('Partly Transfer');
});

interface LineInput {
  amount: string;
  category: string;
}

/** Splits the open Transaction into these two lines. */
async function splitInTwo(page: Page, [first, second]: [LineInput, LineInput]): Promise<void> {
  await page.getByText('Split Transaction').click();
  const form = page.getByRole('form', { name: 'Split' });
  await form.getByLabel('Amount of line 1').fill(first.amount);
  await form.getByLabel('Category of line 1').selectOption({ label: first.category });
  await form.getByRole('button', { name: 'Add line' }).click();
  await form.getByLabel('Amount of line 2').fill(second.amount);
  await form.getByLabel('Category of line 2').selectOption({ label: second.category });
  await form.getByRole('button', { name: 'Save Split' }).click();
  await expect(page.getByRole('heading', { name: 'Split (2)' })).toBeVisible();
}

test('links a Split line with a Split line of a Transaction on another Account', async ({
  page,
}) => {
  // ADR-0005: BCGE -1,500 is -1,000 to UBS and -500 rent; UBS +1,200 is +1,000 from BCGE and
  // +200 salary.
  const suffix = Date.now();
  const bcge = `BCGE lines ${suffix}`;
  const ubs = `UBS lines ${suffix}`;
  const debit = `Ordre lignes ${suffix}`;
  const credit = `Versement lignes ${suffix}`;
  const group = `Mixed ${suffix}`;
  const rent = `Rent ${suffix}`;
  const salary = `Salary ${suffix}`;
  await page.goto('/categories');
  await addCategoryGroup(page, group, 'Expense');
  await addCategory(page, group, rent);
  await addCategory(page, group, salary);
  await manualAccountWith(page, bcge, "-1'500", debit);
  await manualAccountWith(page, ubs, "1'200", credit);

  await openTransaction(page, await openByDescription(page, credit));
  await splitInTwo(page, [
    { amount: "1'000", category: salary },
    { amount: '200', category: salary },
  ]);
  await openTransaction(page, await openByDescription(page, debit));
  await splitInTwo(page, [
    { amount: "-1'000", category: rent },
    { amount: '-500', category: rent },
  ]);

  // The picker of the -1,000 line offers the UBS +1,000 line; link it
  const lines = page.getByRole('table', { name: 'Split lines' }).locator('tbody tr');
  await lines.nth(0).locator('summary', { hasText: 'Link as Transfer' }).click();
  const link = page.getByRole('form', { name: 'Link line 1 as Transfer' });
  const ubsLine = link
    .getByRole('option')
    .filter({ hasText: `a Split line of CHF 1'000.00 of ${ubs}` });
  await expect(ubsLine).toHaveCount(1);
  await link.getByLabel('Other side').selectOption((await ubsLine.getAttribute('value'))!);
  await link.getByRole('button', { name: 'Link as Transfer' }).click();
  await expect(lines.nth(0)).toContainText(`Transfer with a Split line of CHF 1'000.00 of ${ubs}`);
  await expect(lines.nth(1)).toContainText(`${group} › ${rent}`);

  // The UBS line shows the BCGE line back, and links to it
  await lines
    .nth(0)
    .getByRole('link', { name: new RegExp(ubs) })
    .click();
  await expect(page.getByRole('heading', { name: 'Split (2)' })).toBeVisible();
  const ubsLines = page.getByRole('table', { name: 'Split lines' }).locator('tbody tr');
  await expect(ubsLines.nth(0)).toContainText(
    `Transfer with a Split line of CHF -1'000.00 of ${bcge}`,
  );
  await expect(ubsLines.nth(1)).toContainText(`${group} › ${salary}`);
  await expect(page.getByText('Partly Transfer')).toBeVisible();
  await ubsLines
    .nth(0)
    .getByRole('link', { name: new RegExp(bcge) })
    .click();
  await expect(page.getByRole('table', { name: 'Split lines' })).toContainText(
    `Transfer with a Split line of CHF 1'000.00 of ${ubs}`,
  );
});
