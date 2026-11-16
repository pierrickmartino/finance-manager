import { expect, test, type Page } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { splitTransaction } from '../src/server/services/transactions/split';
import {
  linkTransfer,
  splitLineSide,
  transactionSide,
  unlinkTransfer,
} from '../src/server/services/transfers';
import { addExpenseCategory } from './support/categories';
import { withServices } from './support/services';
import { openTransaction } from './support/transactions';
import { openAccountPage, openNewAccountForm } from './support/accounts';

/** Creates a Bank and a manual Account (no Import format) and opens the Account page. */
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
  await expect(kiosk.getByRole('table').locator('tbody tr td').nth(3)).toHaveText(
    `Kiosk ${suffix}`,
  );

  // Tags given in a Bulk edit are added: the ones the Transaction has stay
  await kiosk.getByLabel('Payee').fill('');
  await kiosk.getByLabel('Tags').fill(`Snacks ${suffix}`);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    kiosk.getByRole('button', { name: 'Classify selected (1)' }).click(),
  ]);
  await kiosk.getByLabel('Tags').fill(tagName);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    kiosk.getByRole('button', { name: 'Classify selected (1)' }).click(),
  ]);
  await kiosk.getByRole('link', { name: 'Open' }).click();
  await expect(page.getByRole('form', { name: 'Classification' }).getByLabel('Tags')).toHaveValue(
    `Snacks ${suffix}, ${tagName}`,
  );
});

/**
 * A group of two "Ordre <suffix>" debits, one of them split with a line that has neither a
 * Category nor a Transfer (linked, then unlinked), so it is still Unclassified.
 */
async function seedGroupWithSplitMember(suffix: number) {
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Split bank ${suffix}` });
    const newAccount = (name: string) =>
      createAccount(ctx, {
        bankId: bank.id,
        kind: 'current',
        importFormat: null,
        name: `${name} ${suffix}`,
        currency: 'CHF',
        openingBalanceMinor: 0,
        openingDate: '2021-01-01',
      });
    const current = await newAccount('Split current');
    const savings = await newAccount('Split savings');
    const group = await createCategoryGroup(ctx, { name: `Home ${suffix}`, type: 'expense' });
    const rent = await createCategory(ctx, { groupId: group.id, name: `Rent ${suffix}` });
    const add = (accountId: string, amountMinor: number, description: string) =>
      createManualTransaction(ctx, {
        accountId,
        bookingDate: '2025-04-02',
        amountMinor,
        description,
      });

    const split = await add(current.id, -15_00, `Ordre ${suffix}`);
    await add(current.id, -20_00, `Ordre ${suffix}`);
    const credit = await add(savings.id, 10_00, `Credit ${suffix}`);
    const { splitLines } = await splitTransaction(ctx, split.id, [
      { amountMinor: -10_00, categoryId: rent.id },
      { amountMinor: -5_00, categoryId: rent.id },
    ]);
    const line = splitLines[0]!.id;
    await linkTransfer(ctx, { sides: [splitLineSide(line), transactionSide(credit.id)] });
    await unlinkTransfer(ctx, splitLineSide(line));
    return { rentName: rent.name };
  });
}

test('a group Category edit leaves a split member out and says so', async ({ page }) => {
  const suffix = Date.now();
  const { rentName } = await seedGroupWithSplitMember(suffix);

  await page.goto(`/unclassified?group=${encodeURIComponent(`ordre ${suffix}`)}`);
  const ordre = page.getByRole('form', { name: `Classify Ordre ${suffix}` });
  await expect(ordre.getByRole('table').locator('tbody tr')).toHaveCount(2);
  await ordre.getByLabel('Category').selectOption({ label: rentName });
  await ordre.getByRole('button', { name: 'Classify all 2' }).click();

  await expect(ordre.getByRole('status')).toHaveText(
    'Classified 1 Transaction · 1 split or Transfer left out.',
  );
  // The split member stays in the group: only its lines can take a Category.
  await expect(ordre.getByRole('table').locator('tbody tr')).toHaveCount(1);
});
