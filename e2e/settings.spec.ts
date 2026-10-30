import { expect, test, type Page } from '@playwright/test';

async function saveFormats(page: Page, numberFormat: string, dateFormat: string): Promise<void> {
  await page.getByLabel('Number format').selectOption({ label: numberFormat });
  await page.getByLabel('Date format').selectOption({ label: dateFormat });
  await page.getByRole('button', { name: 'Save' }).click();
}

test('changing the display formats changes how amounts and dates render', async ({ page }) => {
  await page.goto('/settings');
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview).toContainText("1'234'567.89");
  await expect(preview).toContainText('31.12.2025');

  await saveFormats(page, '1.234,50', 'yyyy-mm-dd');

  await expect(preview).toContainText('1.234.567,89');
  await expect(preview).toContainText('2025-12-31');
  await page.reload();
  await expect(preview).toContainText('1.234.567,89');

  // The E2E database is shared by the run: restore the Swiss defaults.
  await saveFormats(page, "1'234.50", 'dd.mm.yyyy');
  await expect(preview).toContainText("1'234'567.89");
});
