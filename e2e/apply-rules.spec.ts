import { expect, test, type Page } from '@playwright/test';
import { addExpenseCategory } from './support/categories';
import { openAccountPage, openNewAccountForm } from './support/accounts';

/** A unique word with letters only: a suggested Rule's description fragment skips numbers. */
function uniqueWord(): string {
  return Date.now()
    .toString(36)
    .replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)]!);
}

async function openNewManualAccount(page: Page, accountName: string, bankName: string) {
  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, accountName);
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
}

async function addManualTransaction(page: Page, amount: string, description: string) {
  const entry = page.getByRole('region', { name: 'Manual transactions' });
  await entry.getByLabel('Date').fill('2025-05-06');
  await entry.getByLabel('Amount (CHF)').fill(amount);
  await entry.getByLabel('Description').fill(description);
  await entry.getByLabel('Description').press('Enter');
  await expect(entry.getByRole('status')).toContainText(`Added ${description}`);
}

test('creates a Rule from an Unclassified Transaction and applies it to existing ones', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: every name below is unique to this test.
  const word = uniqueWord();
  const groupName = `Bread ${word}`;
  const categoryName = `Bakery ${word}`;
  const groupKey = `boulangerie ${word} lausanne`;
  page.on('dialog', (dialog) => void dialog.accept());

  await addExpenseCategory(page, groupName, categoryName);

  await openNewManualAccount(page, `Rules account ${word}`, `Rules bank ${word}`);
  await addManualTransaction(page, '-4.50', `BOULANGERIE ${word.toUpperCase()} LAUSANNE 0612`);
  await addManualTransaction(page, '-6.10', `Boulangerie ${word} Lausanne 0613`);

  // Create a Rule from one Transaction of the Unclassified group; the editor is prefilled
  await page.goto(`/unclassified?group=${encodeURIComponent(`${groupKey} 0612`)}`);
  await page
    .getByRole('link', { name: new RegExp(`^Create rule from BOULANGERIE ${word}`, 'i') })
    .click();
  const form = page.getByRole('form', { name: 'Rule' });
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue(groupKey);
  await expect(form.getByLabel('Condition 2 value')).toHaveValue(groupKey);
  await form.getByLabel('Set Category').selectOption({ label: categoryName });
  await form.getByRole('button', { name: 'Create Rule' }).click();

  // The apply preview: both Transactions would get the Category
  await expect(page.getByRole('heading', { name: `Apply “${groupKey}”` })).toBeVisible();
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview).toContainText(/2 of \d+ Transactions would change: Category on 2\./);
  const changes = preview.getByRole('table', { name: 'Changes' }).locator('tbody tr');
  await expect(changes).toHaveCount(2);
  await expect(changes.first()).toContainText(`Category: — → ${groupName} › ${categoryName}`);
  await preview.getByRole('button', { name: 'Apply to 2 Transactions' }).click();
  await expect(preview.getByRole('status')).toHaveText('Applied to 2 Transactions.');
  await expect(preview).toContainText(/Nothing to change/);

  // The group is gone from Unclassified
  for (const suffix of ['0612', '0613']) {
    await page.goto(`/unclassified?group=${encodeURIComponent(`${groupKey} ${suffix}`)}`);
    await expect(page.getByText('This group has no Unclassified Transactions left.')).toBeVisible();
  }

  // The Rule's match count, then clean up: Rules are global
  await page.goto('/rules');
  const row = page
    .getByRole('list', { name: 'Rules', exact: true })
    .getByRole('listitem')
    .filter({ hasText: groupKey });
  await expect(row).toContainText('Matches: 2');
  await row.getByRole('link').click();
  const detail = page.getByRole('article');
  await expect(detail.getByText('Matches now').locator('..')).toContainText('2');
  await detail.getByRole('button', { name: 'Delete' }).click();
  await expect(row).toHaveCount(0);
});
