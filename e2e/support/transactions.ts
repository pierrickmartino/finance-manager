/** Transactions list steps shared by the specs that open a Transaction from the list. */
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { breakpointPx } from '../../src/lib/breakpoints';
import { openAccountPage, openNewAccountForm } from './accounts';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

/** Tailwind's `xl` and up: the Transaction preview shows beside the list. */
export const WIDE = { width: breakpointPx('xl'), height: 800 };
/** Below `xl` (at `lg`): no preview, a row opens its Transaction detail. */
export const NARROW = { width: breakpointPx('lg'), height: 768 };

/**
 * Opens a Transaction from a row of the list: the row previews it beside the list, and the
 * preview's button opens its page.
 */
export async function openTransaction(page: Page, row: Locator): Promise<void> {
  await row.getByRole('link').click();
  const preview = page.getByRole('complementary', { name: 'Transaction preview' });
  await expect(row.getByRole('link')).toHaveAttribute('aria-current', 'true');
  await preview.getByRole('link', { name: 'Open & classify' }).click();
}

/**
 * Holds a Transaction detail's content back by `ms`, as a slow server would, so a navigation to
 * one always shows its loading skeleton first. Prefetches (which bring the skeleton) go through.
 */
export async function slowTransactionDetails(page: Page, ms: number): Promise<void> {
  await page.route(/\/transactions\/[^/?]+(\?|$)/, async (route) => {
    const isPrefetch = (await route.request().headerValue('next-router-prefetch')) !== null;
    if (!isPrefetch) await new Promise((resolve) => setTimeout(resolve, ms));
    await route.fallback();
  });
}

/** Adds a Bank and an Account named after `label`, imports the UBS file into it, returns its name. */
export async function importUbsAccount(page: Page, label: string): Promise<string> {
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
export async function listAccount(page: Page, accountName: string): Promise<Locator> {
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

/** The Transaction detail has loaded: its content, not only its skeleton. */
export async function detailShown(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/transactions\/[^/?]+(\?|$)/);
  await expect(page.getByRole('heading', { name: 'From the bank' })).toBeVisible();
}

/**
 * "← Transactions" on the Transaction detail. The morph back runs on this link, not on the
 * browser's back button: React runs history traversals synchronously, without a view transition.
 */
export async function backToList(page: Page): Promise<void> {
  await page.getByRole('link', { name: '← Transactions' }).click();
}

/** Back on the Transactions list the Transaction was opened from (still this Account's), with its rows. */
export async function listShown(rows: Locator): Promise<void> {
  await expect(rows.page()).toHaveURL(/\/transactions\?/);
  await expect(rows).toHaveCount(14);
}
