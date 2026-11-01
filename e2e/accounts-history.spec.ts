import { expect, test, type Page } from '@playwright/test';
import {
  accountDetail,
  accountListEntry,
  openAccountPage,
  openNewAccountForm,
} from './support/accounts';

async function createBank(page: Page, name: string): Promise<void> {
  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
}

function zurichDate(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000),
  );
}

test('creates, edits and archives an Account, then finds each change in History', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: use names no other test creates.
  const suffix = Date.now();
  const bankName = `BCGE ${suffix}`;
  const accountName = `Savings ${suffix}`;
  const renamed = `Joint savings ${suffix}`;
  await createBank(page, bankName);

  // Create
  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByLabel('Kind').selectOption({ label: 'Savings' });
  await form.getByLabel('Import format').selectOption({ label: 'BCGE CAMT.053' });
  await form.getByLabel('Opening balance').fill("1'234.50");
  await form.getByLabel('Opening date').fill('2021-01-01');
  await form.getByRole('button', { name: 'Add Account' }).click();

  // The new Account is selected right away
  const detail = accountDetail(page, accountName);
  await expect(detail).toContainText("CHF 1'234.50");
  await expect(detail).toContainText('Active');
  await expect(accountListEntry(page, accountName)).toHaveAttribute('aria-current', 'true');

  // A rejected edit keeps what was typed and explains why
  await openAccountPage(page, accountName);
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await page.getByLabel('Opening balance').fill('12x');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Opening balance "12x" is not an amount')).toHaveRole('alert');
  await expect(page.getByLabel('Opening balance')).toHaveValue('12x');

  // Edit
  await page.getByLabel('Opening balance').fill("1'234.50");
  await page.getByLabel('Account name').fill(renamed);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible();

  // Archive
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Archive Account' }).click();
  await expect(page.getByText(/Archived on/)).toBeVisible();

  await page.goto('/accounts');
  await expect(accountListEntry(page, renamed)).toContainText('(archived)');

  // History, filtered to this Account
  await openAccountPage(page, renamed);
  await page.getByRole('link', { name: 'History of this Account' }).click();
  const entries = page.getByRole('table', { name: 'History entries' });
  const historyRows = entries.locator('tbody tr');
  await expect(historyRows.filter({ hasText: 'archivedAt' })).toHaveCount(1);
  await expect(historyRows.filter({ hasText: 'importFormat' })).toContainText('camt053');
  await expect(historyRows.filter({ hasText: 'openingBalanceMinor' })).toContainText("1'234.50");
  // Every row is this Account: creation fields, the rename and the archive.
  await expect(historyRows.filter({ hasNotText: 'account' })).toHaveCount(0);

  // Filter by the Batch of the rename: only that change
  await historyRows
    .filter({ hasText: renamed })
    .getByRole('link', { name: /^[0-9a-f]{8}$/ })
    .click();
  await expect(page).toHaveURL(/batchId=/);
  await expect(historyRows).toHaveCount(1);
  await expect(historyRows.first()).toContainText(accountName);
  await expect(historyRows.first()).toContainText(renamed);

  // Filter by actor and by date through the form
  await historyRows.first().getByRole('link', { name: 'account', exact: true }).click();
  await expect(page).toHaveURL(/entityId=/);
  const filters = page.getByRole('form', { name: 'Filter History' });
  await filters.getByLabel('Actor').selectOption('rule');
  await filters.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByText('No History entries match.')).toBeVisible();

  await filters.getByLabel('Actor').selectOption('manual');
  await filters.getByLabel('From', { exact: true }).fill(zurichDate(1));
  await filters.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByText('No History entries match.')).toBeVisible();

  await filters.getByLabel('From', { exact: true }).fill(zurichDate(0));
  await filters.getByLabel('To', { exact: true }).fill(zurichDate(0));
  await filters.getByRole('button', { name: 'Filter' }).click();
  await expect(historyRows.filter({ hasText: 'archivedAt' })).toHaveCount(1);
  await expect(page).toHaveURL(/actorType=manual/);
});
