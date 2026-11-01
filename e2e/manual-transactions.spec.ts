import { expect, test, type Page } from '@playwright/test';
import { accountListEntry, openAccountPage, openNewAccountForm } from './support/accounts';

/** Creates a Bank and a manual Account (no Import format) and opens the Account page. */
async function openNewManualAccount(page: Page, accountName: string, bankName: string) {
  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByLabel('Opening balance').fill('1000');
  await form.getByLabel('Opening date').fill('2025-01-01');
  await form.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, accountName);
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
}

test('enters several Manual transactions in a row with the keyboard, then checks them against a Balance snapshot', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: use names no other test creates.
  const suffix = Date.now();
  const accountName = `Cler current ${suffix}`;
  await openNewManualAccount(page, accountName, `Cler ${suffix}`);

  const entry = page.getByRole('region', { name: 'Manual transactions' });
  const rows = entry.getByRole('table', { name: 'Manual transactions' }).locator('tbody tr');
  const date = entry.getByLabel('Date');
  const amount = entry.getByLabel('Amount (CHF)');

  // Row 1: type every field, Enter saves
  await date.fill('2025-03-01');
  await amount.fill('-45.90');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Coop Pronto');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Coop');
  await page.keyboard.press('Enter');
  await expect(entry.getByRole('status')).toHaveText('Added Coop Pronto (CHF -45.90).');

  // Row 2: the date carried over and the cursor is back in Amount
  await expect(amount).toBeFocused();
  await expect(amount).toHaveValue('');
  await expect(date).toHaveValue('2025-03-01');
  await page.keyboard.type('-12');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Migros');
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(2);

  // Row 3: a new date
  await expect(amount).toBeFocused();
  await date.fill('2025-03-25');
  await amount.fill("2'000");
  await entry.getByLabel('Description').fill('Salary');
  await entry.getByLabel('Description').press('Enter');
  await expect(rows).toHaveCount(3);
  await expect(date).toHaveValue('2025-03-25');

  await expect(rows.nth(0)).toContainText('01.03.2025');
  await expect(rows.nth(0)).toContainText('Coop Pronto');
  await expect(rows.nth(1)).toContainText('-12.00');
  await expect(rows.nth(2)).toContainText("2'000.00");
  await expect(page.getByText("Balance CHF 2'942.10")).toBeVisible();

  // A Balance snapshot that disagrees: warned on the Account and in the overview
  const snapshots = page.getByRole('region', { name: 'Balance snapshots' });
  await snapshots.getByLabel('Snapshot date').fill('2025-03-31');
  await snapshots.getByLabel('Balance (CHF)').fill("2'900");
  await snapshots.getByRole('button', { name: 'Add Balance snapshot' }).click();
  await expect(snapshots.getByRole('table', { name: 'Balance snapshots' })).toContainText(
    'Differs by CHF 42.10',
  );
  const warning = page.getByRole('alert').filter({ hasText: 'differs from the computed balance' });
  await expect(warning).toContainText(
    "On 31.03.2025 the Balance snapshot says CHF 2'900.00, but the computed balance is CHF 2'942.10",
  );
  await page.goto('/accounts');
  await expect(
    page.getByRole('alert').filter({ hasText: 'differ' }).getByRole('listitem').filter({
      hasText: accountName,
    }),
  ).toContainText("the Balance snapshot says CHF 2'900.00");
  await expect(accountListEntry(page, accountName)).toContainText('Snapshot mismatch');

  // Enter the missing Transaction: the warning clears
  await openAccountPage(page, accountName);
  await date.fill('2025-03-20');
  await amount.fill('-42.10');
  await entry.getByLabel('Description').fill('Pharmacy');
  await entry.getByLabel('Description').press('Enter');
  await expect(rows).toHaveCount(4);
  await expect(snapshots.getByRole('table', { name: 'Balance snapshots' })).toContainText(
    'Matches',
  );
  await expect(warning).toHaveCount(0);

  // Fix a typo, then delete a row
  await entry.getByRole('link', { name: 'Edit Migros (01.03.2025)' }).click();
  await expect(page.getByRole('heading', { name: 'Manual transaction' })).toBeVisible();
  await page.getByLabel('Description').fill('Migros Plainpalais');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete this Manual transaction' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Migros' })).toHaveCount(0);
});
