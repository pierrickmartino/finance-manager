/** Helpers for the Accounts page, a master / detail: the Account list and the detail pane. */
import { expect, type Locator, type Page } from '@playwright/test';

/** Opens /accounts with the New Account form in the detail pane, and returns the form's region. */
export async function openNewAccountForm(page: Page): Promise<Locator> {
  await page.goto('/accounts?account=new');
  return page.getByRole('region', { name: 'New Account' });
}

/** The Account's entry in the list on /accounts (its name, then its balance). */
export function accountListEntry(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Account list' }).getByRole('link', { name });
}

/** The detail pane on /accounts while it shows this Account. */
export function accountDetail(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true });
}

/** On /accounts: selects the Account in the list, then opens its own page. */
export async function openAccountPage(page: Page, name: string): Promise<void> {
  await accountListEntry(page, name).click();
  await accountDetail(page, name).getByRole('link', { name: 'Open Account' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}
