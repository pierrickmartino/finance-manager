import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openAccountPage, openNewAccountForm } from './support/accounts';
import { openTransaction } from './support/transactions';
import {
  viewTransitionAnimationsDuring,
  type ViewTransitionAnimation,
} from './support/view-transitions';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

/** Tailwind's `xl` and up: the Transaction preview shows beside the list. */
const WIDE = { width: 1280, height: 800 };
/** Below `xl`: no preview, a row opens its Transaction detail. */
const NARROW = { width: 1024, height: 768 };

test('searches imported Transactions and opens one with its bank fields and History', async ({
  page,
}) => {
  // The E2E database is shared by the whole run (other tests import the same file), so every
  // search below is narrowed to this test's own Account.
  const accountName = await importUbsAccount(page, 'Transactions');

  // The Account's Transactions, newest first
  await page.getByRole('navigation').getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Account').selectOption({ label: accountName });
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('14 Transactions')).toBeVisible();
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(14);
  await expect(rows.first()).toContainText('31.10.2025');

  // Text ignores case and accents; amounts are typed in the user's number format
  await search.getByLabel('Search').fill('TELECOM exemple');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('-64.90');
  // The first row is previewed beside the list until another is picked
  const preview = page.getByRole('complementary', { name: 'Transaction preview' });
  await expect(preview).toContainText('-64.90');

  await search.getByLabel('Search').fill('');
  await search.getByLabel('Amount to').fill("-1'000.00");
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('2 Transactions')).toBeVisible();

  await search.getByLabel('Amount to').fill('lots');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Maximum amount must be an amount' }),
  ).toBeVisible();

  // Detail: bank fields read-only, the source Import, and the Transaction's History
  await search.getByLabel('Amount to').fill('');
  await search.getByLabel('Search').fill('telecom');
  await search.getByRole('button', { name: 'Search' }).click();
  await openTransaction(page, rows.first());
  const fields = page.getByRole('definition');
  await expect(page.getByRole('heading', { name: 'From the bank' })).toBeVisible();
  // Two columns: what to do with it on the left, what is known about it on the right
  const edits = page.getByRole('complementary', { name: 'Classify and link' });
  await expect(edits.getByRole('heading', { name: 'Classification' })).toBeVisible();
  await expect(edits.getByRole('heading', { name: 'Transfer' })).toBeVisible();
  await expect(fields.filter({ hasText: 'CH2009000000087654321' })).toBeVisible();
  await expect(fields.filter({ hasText: '9930288TI0000107' })).toBeVisible();
  await expect(fields.filter({ hasText: 'Import of ubs-chf-2025-10.csv' })).toBeVisible();
  await expect(page.locator('dl[aria-label="Bank fields"]').getByRole('textbox')).toHaveCount(0);
  // The History is open at the foot of the page, no click needed
  const history = page.getByRole('list', { name: 'Transaction History' }).locator(':scope > li');
  await expect(history.filter({ hasText: 'amountMinor' })).toContainText('import');
  await expect(history.filter({ hasText: 'bankReference' })).toContainText('9930288TI0000107');

  // Too narrow for the preview: a row opens its Transaction straight away
  const detailUrl = page.url();
  await page.goBack();
  await page.setViewportSize(NARROW);
  await expect(preview).toBeHidden();
  await rows.first().getByRole('link').click();
  await expect(page).toHaveURL(detailUrl);
});

test.describe('opening a Transaction morphs it into its Transaction detail', () => {
  test('below xl, the tapped row expands into the detail and shrinks back', async ({ page }) => {
    const warnings = duplicateNameWarnings(page);
    const accountName = await importUbsAccount(page, 'Morph narrow');
    await page.setViewportSize(NARROW);
    const rows = await listAccount(page, accountName);

    const opening = await motionDuring(page, async () => {
      await rows.nth(1).getByRole('link').click();
      await detailShown(page);
    });
    expect(opening.length).toBeGreaterThan(0);

    const back = await motionDuring(page, async () => {
      await backToList(page);
      await listShown(rows);
    });
    expect(back.length).toBeGreaterThan(0);
    expect(warnings).toEqual([]);
  });

  test('at xl, "Open & classify" expands the preview into the detail and back; picking a row is instant', async ({
    page,
  }) => {
    const warnings = duplicateNameWarnings(page);
    const accountName = await importUbsAccount(page, 'Morph wide');
    await page.setViewportSize(WIDE);
    const rows = await listAccount(page, accountName);
    const preview = page.getByRole('complementary', { name: 'Transaction preview' });

    const picking = await motionDuring(page, async () => {
      await rows.nth(1).getByRole('link').click();
      await expect(rows.nth(1).getByRole('link')).toHaveAttribute('aria-current', 'true');
    });
    expect(picking).toEqual([]);

    const opening = await motionDuring(page, async () => {
      await preview.getByRole('link', { name: 'Open & classify' }).click();
      await detailShown(page);
    });
    expect(opening.length).toBeGreaterThan(0);

    const back = await motionDuring(page, async () => {
      await backToList(page);
      await listShown(rows);
      await expect(preview).toBeVisible();
    });
    expect(back.length).toBeGreaterThan(0);
    expect(warnings).toEqual([]);
  });

  test('under reduced motion, opening and going back swap instantly at both widths', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const accountName = await importUbsAccount(page, 'Morph reduced');
    const preview = page.getByRole('complementary', { name: 'Transaction preview' });

    await page.setViewportSize(WIDE);
    const rows = await listAccount(page, accountName);
    const wide = await motionDuring(page, async () => {
      await preview.getByRole('link', { name: 'Open & classify' }).click();
      await detailShown(page);
      await backToList(page);
      await listShown(rows);
    });
    expect(wide).toEqual([]);

    await page.setViewportSize(NARROW);
    await expect(preview).toBeHidden();
    const narrow = await motionDuring(page, async () => {
      await rows.first().getByRole('link').click();
      await detailShown(page);
      await backToList(page);
      await listShown(rows);
    });
    expect(narrow).toEqual([]);
  });
});

/** Adds a Bank and an Account named after `label`, imports the UBS file into it, returns its name. */
async function importUbsAccount(page: Page, label: string): Promise<string> {
  const suffix = Date.now();
  const bankName = `${label} bank ${suffix}`;
  const accountName = `${label} account ${suffix}`;

  await page.goto('/banks?bank=new');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  const form = await openNewAccountForm(page);
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await form.getByRole('button', { name: 'Add Account' }).click();
  await openAccountPage(page, accountName);
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Commit import (14 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  return accountName;
}

/** Lists the Account's 14 Transactions, newest first, and returns their rows. */
async function listAccount(page: Page, accountName: string): Promise<Locator> {
  await page.goto('/transactions');
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Account').selectOption({ label: accountName });
  await search.getByRole('button', { name: 'Search' }).click();
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(14);
  // The search reloads the page, and a row only morphs once the page has hydrated and knows
  // its width; a click before then just opens the Transaction.
  await page.waitForLoadState('networkidle');
  return rows;
}

/**
 * The view-transition animations that moved something while `action` ran. React adds instant
 * (0ms) housekeeping animations to the root's pseudo-elements, even under reduced motion.
 */
async function motionDuring(
  page: Page,
  action: () => Promise<unknown>,
): Promise<ViewTransitionAnimation[]> {
  const animations = await viewTransitionAnimationsDuring(page, action);
  return animations.filter((animation) => animation.duration > 0);
}

/** The Transaction detail has loaded: its content, not only its skeleton. */
async function detailShown(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/transactions\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: 'From the bank' })).toBeVisible();
}

/**
 * "← Transactions" on the Transaction detail. The morph back runs on this link, not on the
 * browser's back button: React runs history traversals synchronously, without a view transition.
 */
async function backToList(page: Page): Promise<void> {
  await page.getByRole('link', { name: '← Transactions' }).click();
}

/** Back on the Transactions list the Transaction was opened from (still this Account's), with its rows. */
async function listShown(rows: Locator): Promise<void> {
  await expect(rows.page()).toHaveURL(/\/transactions\?/);
  await expect(rows).toHaveCount(14);
}

/**
 * Collects React's warning that two mounted `<ViewTransition>`s share a name. React prints it
 * only in development builds (`E2E_SERVER=dev`); a production build never reports one.
 */
function duplicateNameWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('with the same name mounted at the same time')) {
      warnings.push(message.text());
    }
  });
  return warnings;
}
