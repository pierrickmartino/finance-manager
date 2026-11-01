/** Payees page steps shared by the specs that need a Payee of their own. */
import { expect, type Page } from '@playwright/test';

/** Opens /payees and adds a Payee; the page then shows it. */
export async function addPayee(page: Page, name: string): Promise<void> {
  await page.goto('/payees');
  await page.getByRole('navigation', { name: 'Payees' }).getByText('+ New Payee').click();
  const form = page.getByRole('form', { name: 'New Payee' });
  await form.getByLabel('Payee name').fill(name);
  await form.getByRole('button', { name: 'Add Payee' }).click();
  await expect(page.getByRole('region', { name: `Payee ${name}` })).toBeVisible();
}
