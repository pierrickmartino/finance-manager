/** Transactions list steps shared by the specs that open a Transaction from the list. */
import { expect, type Locator, type Page } from '@playwright/test';

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
