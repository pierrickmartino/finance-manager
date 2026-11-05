import { expect, test, type Page } from '@playwright/test';

/** Opens a setting's row and picks a choice, which saves it straight away. */
async function pickFormat(page: Page, setting: string, choice: string): Promise<void> {
  await page.getByRole('button', { name: setting }).click();
  await page.getByRole('button', { name: choice }).click();
  // The row closes once the choice is saved.
  await expect(page.getByRole('button', { name: setting })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
}

test('picking a display format changes how amounts and dates render', async ({ page }) => {
  await page.goto('/settings');
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText("1'234'567.89");
  await expect(summary).toContainText('31.12.2025');

  await pickFormat(page, 'Number format', '1.234,50 (German)');
  await pickFormat(page, 'Date format', '2025-12-31 (ISO 8601)');

  await expect(summary).toContainText('1.234.567,89');
  await expect(summary).toContainText('2025-12-31');
  await expect(page.getByRole('button', { name: 'Number format' })).toContainText('1.234,50');
  await page.reload();
  await expect(summary).toContainText('1.234.567,89');

  // The E2E database is shared by the run: restore the Swiss defaults.
  await pickFormat(page, 'Number format', "1'234.50 (Swiss)");
  await pickFormat(page, 'Date format', '31.12.2025 (Day first, dots)');
  await expect(summary).toContainText("1'234'567.89");
});

test('the open choice list marks the saved format', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Date format' }).click();

  await expect(page.getByRole('button', { name: '31.12.2025 (Day first, dots)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '2025-12-31 (ISO 8601)' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
