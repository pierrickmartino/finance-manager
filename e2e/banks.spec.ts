import { expect, test } from '@playwright/test';

test('creates a Bank through the UI and lists it', async ({ page }) => {
  // The E2E database is shared by the whole run: use a name no other test creates.
  const name = `UBS ${Date.now()}`;

  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();

  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
  await expect(page.getByLabel('Bank name')).toHaveValue('');

  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
});

test('shows why a Bank could not be created', async ({ page }) => {
  const name = `Cler ${Date.now()}`;
  await page.goto('/banks');

  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();

  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();

  await expect(page.getByText(`A Bank named "${name}" already exists`)).toHaveRole('alert');
});
