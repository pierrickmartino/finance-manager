import { expect, test, type Locator, type Page } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { bulkEditClassification } from '../src/server/services/transactions/bulk-edit';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { splitTransaction } from '../src/server/services/transactions/split';
import { breakpointPx } from '../src/lib/breakpoints';
import { withServices } from './support/services';

/** Tailwind's `xl` and up: the Transaction preview shows beside the list. */
const WIDE = { width: breakpointPx('xl'), height: 800 };
/** A phone: one column, the action bar fixed to the bottom. */
const PHONE = { width: 390, height: 844 };

/** One more than a page of the list (50 rows), so there is a second page. */
const SEEDED = 52;

const itemName = (n: number, suffix: number) => `Item ${String(n).padStart(2, '0')} ${suffix}`;

/**
 * An Account with 52 manual Transactions, "Item 01" oldest to "Item 52" newest (one per day),
 * so the list shows Item 52 first. Item 50 is split; Item 51 has the Tag "Trip".
 */
async function seedAccount(suffix: number) {
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Bulk bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Bulk account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2024-01-01',
    });
    const group = await createCategoryGroup(ctx, { name: `Food ${suffix}`, type: 'expense' });
    const groceries = await createCategory(ctx, { groupId: group.id, name: `Groceries ${suffix}` });
    const ids = new Map<number, string>();
    for (let n = 1; n <= SEEDED; n += 1) {
      const day = new Date(Date.UTC(2025, 0, n)).toISOString().slice(0, 10);
      const created = await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: day,
        amountMinor: -n * 100,
        description: itemName(n, suffix),
      });
      ids.set(n, created.id);
    }
    await splitTransaction(ctx, ids.get(50)!, [
      { amountMinor: -30_00, categoryId: groceries.id },
      { amountMinor: -20_00, categoryId: groceries.id },
    ]);
    await bulkEditClassification(ctx, {
      transactionIds: [ids.get(51)!],
      changes: { addTagNames: [`Trip ${suffix}`] },
    });
    return { accountId: account.id, groceriesName: groceries.name };
  });
}

test('selects Transactions on the list and bulk edits them from the action bar', async ({
  page,
}) => {
  // The E2E database is shared by the whole run: every name below is unique to this test.
  const suffix = Date.now();
  const { accountId, groceriesName } = await seedAccount(suffix);
  const item = (n: number) => itemName(n, suffix);

  await page.setViewportSize(WIDE);
  await page.goto(`/transactions?accountId=${accountId}`);
  await expect(page.getByText(`${SEEDED} Transactions`)).toBeVisible();
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(50);
  await expect(rows.first()).toContainText(item(52));
  await page.waitForLoadState('networkidle');
  const row = (n: number) => rows.filter({ hasText: item(n) });
  const checkbox = (n: number) => row(n).getByRole('checkbox');
  const bar = page.getByRole('region', { name: 'Bulk edit' });
  const header = page.getByRole('checkbox', { name: 'Select every Transaction on this page' });

  // Tick a row, then shift-click a range from it; ticking never changes the URL
  const listUrl = page.url();
  await checkbox(52).check();
  await expect(bar).toContainText('1 selected');
  await checkbox(49).click({ modifiers: ['Shift'] });
  await expect(bar).toContainText('4 selected');
  for (const n of [52, 51, 50, 49]) await expect(checkbox(n)).toBeChecked();
  await expect(checkbox(48)).not.toBeChecked();
  await expect(header).toBeChecked({ indeterminate: true });
  expect(page.url()).toBe(listUrl);

  // Set Category: the split row is left out, the others take the Category
  await bar.getByRole('button', { name: 'Set Category' }).click();
  await bar.getByLabel('Category').selectOption({ label: groceriesName });
  await bar.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status')).toHaveText(
    `Set ${groceriesName} on 3 Transactions · 1 split or Transfer left out.`,
  );
  for (const n of [52, 51, 49]) await expect(row(n)).toContainText(groceriesName);
  await expect(row(50)).toContainText('Split (2)');
  // The selection clears after an edit
  await expect(checkbox(52)).not.toBeChecked();
  await expect(header).not.toBeChecked();

  // Add Tag: a new Tag joins the ones each Transaction has
  await checkbox(52).check();
  await checkbox(51).check();
  await bar.getByRole('button', { name: 'Add Tag' }).click();
  await bar.getByLabel('Tag', { exact: true }).fill(`Vacation ${suffix}`);
  await bar.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status')).toHaveText(`Added Vacation ${suffix} to 2 Transactions.`);
  await expect(row(51)).toContainText(`#Trip ${suffix}`);
  await expect(row(51)).toContainText(`#Vacation ${suffix}`);
  await expect(row(52)).toContainText(`#Vacation ${suffix}`);

  // Remove Tag offers the Tags on the selection and removes only the chosen one
  await checkbox(51).check();
  await bar.getByRole('button', { name: 'Remove Tag' }).click();
  const removable = bar.getByRole('combobox', { name: 'Tag', exact: true });
  await expect(removable.getByRole('option')).toHaveText([`Trip ${suffix}`, `Vacation ${suffix}`]);
  await removable.selectOption({ label: `Trip ${suffix}` });
  await bar.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status')).toHaveText(`Removed Trip ${suffix} from 1 Transaction.`);
  await expect(row(51)).not.toContainText(`#Trip ${suffix}`);
  await expect(row(51)).toContainText(`#Vacation ${suffix}`);

  // Set Payee by typing a new name, from the keyboard
  await checkbox(48).focus();
  await page.keyboard.press('Space');
  await expect(bar).toContainText('1 selected');
  await bar.getByRole('button', { name: 'Set Payee' }).click();
  await bar.getByLabel('Payee').fill(`Corner shop ${suffix}`);
  await bar.getByLabel('Payee').press('Enter');
  await expect(page.getByRole('status')).toHaveText(`Set Corner shop ${suffix} on 1 Transaction.`);
  // The row now goes by its Payee
  const shop = rows.filter({ hasText: `Corner shop ${suffix}` });
  await expect(shop).toContainText('-48.00');

  // A row click still previews the Transaction
  await row(47).getByRole('link').click();
  await expect(row(47).getByRole('link')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('complementary', { name: 'Transaction preview' })).toContainText(
    '-47.00',
  );

  // The header ticks every row on the page; Clear selection unticks them
  await header.check();
  await expect(bar).toContainText('50 selected');
  await bar.getByRole('button', { name: 'Clear selection' }).click();
  await expect(header).not.toBeChecked();
  await expect(bar).toBeHidden();

  // A page change clears the selection
  await checkbox(52).check();
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Next' }).click();
  await expect(rows).toHaveCount(2);
  await expect(bar).toBeHidden();
  await expect(rows.first().getByRole('checkbox')).not.toBeChecked();

  // So does a filter change
  await rows.first().getByRole('checkbox').check();
  await expect(bar).toContainText('1 selected');
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Search').fill(item(1));
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(rows).toHaveCount(1);
  await expect(bar).toBeHidden();
  await expect(rows.first().getByRole('checkbox')).not.toBeChecked();
});

test('on a phone the action bar is fixed to the bottom of the screen', async ({ page }) => {
  const suffix = Date.now();
  const { accountId } = await seedAccount(suffix);

  await page.setViewportSize(PHONE);
  await page.goto(`/transactions?accountId=${accountId}`);
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(50);
  await page.waitForLoadState('networkidle');
  await rows.first().getByRole('checkbox').check();

  const bar = page.getByRole('region', { name: 'Bulk edit' });
  await expect(bar).toContainText('1 selected');
  await expectAtBottom(page, bar);
});

async function expectAtBottom(page: Page, bar: Locator): Promise<void> {
  const box = await bar.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(Math.round(box!.y + box!.height)).toBe(viewport!.height);
}
