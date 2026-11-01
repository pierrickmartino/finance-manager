import { expect, test, type Page } from '@playwright/test';
import { addExpenseCategory } from './support/categories';
import { openTransaction } from './support/transactions';

/** Creates a Bank and a manual Account (no Import format) and opens the Account page. */
async function openNewManualAccount(page: Page, accountName: string, bankName: string) {
  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  await page.goto('/accounts');
  const form = page.getByRole('region', { name: 'New Account' });
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByRole('button', { name: 'Add Account' }).click();
  await page.getByRole('row').filter({ hasText: accountName }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
}

async function addManualTransaction(page: Page, amount: string, description: string) {
  const entry = page.getByRole('region', { name: 'Manual transactions' });
  await entry.getByLabel('Date').fill('2025-04-02');
  await entry.getByLabel('Amount (CHF)').fill(amount);
  await entry.getByLabel('Description').fill(description);
  await entry.getByLabel('Description').press('Enter');
  await expect(entry.getByRole('status')).toContainText(`Added ${description}`);
}

test('classifies a whole group and a selected Transaction from the Unclassified view', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: every name below is unique to this test.
  const suffix = Date.now();
  const groupName = `Eating out ${suffix}`;
  const categoryName = `Coffee ${suffix}`;
  const payeeName = `Café Rose ${suffix}`;
  const tagName = `Treats ${suffix}`;

  await addExpenseCategory(page, groupName, categoryName);

  // Two spellings of one description, and one other
  await openNewManualAccount(page, `Unclassified account ${suffix}`, `Unclassified bank ${suffix}`);
  await addManualTransaction(page, '-4.50', `CAFÉ ROSE ${suffix}`);
  await addManualTransaction(page, '-5.20', `Cafe  Rose ${suffix}`);
  await addManualTransaction(page, '-2.00', `Kiosk ${suffix}`);

  // The progress figure
  await page.goto('/unclassified');
  const progress = page.getByRole('region', { name: 'Classification progress' });
  await expect(progress).toContainText(/\d+\.\d% of Transactions Unclassified/);
  await expect(progress).toContainText('Target: 2.0% or less.');

  // Open the group (the deep link the group's row points to) and classify all of it
  await page.goto(`/unclassified?group=${encodeURIComponent(`cafe rose ${suffix}`)}`);
  const cafe = page.getByRole('form', {
    name: new RegExp(`^Classify (CAFÉ|Cafe) Rose ${suffix}$`, 'i'),
  });
  await expect(cafe.getByRole('table').locator('tbody tr')).toHaveCount(2);
  await cafe.getByLabel('Payee').fill(payeeName);
  await cafe.getByLabel('Category').selectOption({ label: categoryName });
  await cafe.getByLabel('Tags').fill(tagName);
  await cafe.getByRole('button', { name: 'Classify all 2' }).click();
  await expect(page.getByText('This group has no Unclassified Transactions left.')).toBeVisible();

  // Both are classified and locked
  await page.goto('/transactions');
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Search').fill(`rose ${suffix}`);
  await search.getByRole('button', { name: 'Search' }).click();
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: categoryName })).toHaveCount(2);
  await openTransaction(page, rows.first());
  await expect(page.getByRole('list', { name: 'Locked fields' }).getByRole('listitem')).toHaveText([
    /Payee/,
    /Category/,
    /Tags/,
  ]);

  // A selected Transaction: Payee only, so it stays Unclassified
  await page.goto(`/unclassified?group=${encodeURIComponent(`kiosk ${suffix}`)}`);
  const kiosk = page.getByRole('form', { name: `Classify Kiosk ${suffix}` });
  await kiosk.getByRole('checkbox').check();
  await kiosk.getByLabel('Payee').fill(`Kiosk ${suffix}`);
  await kiosk.getByRole('button', { name: 'Classify selected (1)' }).click();
  await expect(kiosk.getByRole('status')).toHaveText('Classified 1 Transaction.');
  await expect(kiosk.getByRole('table').locator('tbody tr')).toContainText(`Kiosk ${suffix}`);
  await expect(kiosk.getByRole('table').locator('tbody tr td').nth(4)).toHaveText(
    `Kiosk ${suffix}`,
  );
});
