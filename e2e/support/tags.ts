/** Tags page steps shared by the specs that need a Tag of their own. */
import { expect, type Page } from '@playwright/test';

/** Opens /tags and adds a Tag; the page then shows it. */
export async function addTag(page: Page, name: string): Promise<void> {
  await page.goto('/tags');
  await page.getByRole('navigation', { name: 'Tags' }).getByText('+ New Tag').click();
  const form = page.getByRole('form', { name: 'New Tag' });
  await form.getByLabel('Tag name').fill(name);
  await form.getByRole('button', { name: 'Add Tag' }).click();
  await expect(page.getByRole('region', { name: `Tag ${name}` })).toBeVisible();
}
