import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SIGNED_OUT } from './support/auth';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);

test('exports the filtered Transaction list as CSV for Excel', async ({ page }) => {
  // The E2E database is shared, so the export is narrowed to this test's own Account.
  const suffix = Date.now();
  const bankName = `Export bank ${suffix}`;
  const accountName = `Export account ${suffix}`;

  await page.goto('/banks');
  await page.getByLabel('Bank name').fill(bankName);
  await page.getByRole('button', { name: 'Add Bank' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: bankName })).toBeVisible();

  await page.goto('/accounts');
  const form = page.getByRole('region', { name: 'New Account' });
  await form.getByLabel('Bank').selectOption({ label: bankName });
  await form.getByLabel('Account name').fill(accountName);
  await form.getByLabel('Import format').selectOption({ label: 'UBS CSV' });
  await form.getByRole('button', { name: 'Add Account' }).click();
  await page.getByRole('row').filter({ hasText: accountName }).getByRole('link').click();
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Commit import (14 new)' }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  await page.goto('/transactions');
  const search = page.getByRole('form', { name: 'Search Transactions' });
  await search.getByLabel('Account').selectOption({ label: accountName });
  await search.getByLabel('Search').fill('telecom');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('1 Transaction', { exact: true })).toBeVisible();

  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export CSV' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^transactions-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile(await download.path(), 'utf8');

  expect(text.startsWith('\uFEFFBank;Account;Account Currency;Booking date;')).toBe(true);
  const lines = text.trimEnd().split('\r\n');
  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain(`${bankName};${accountName};CHF;`);
  expect(lines[1]).toContain(';-64.90;-64.90;');
});

test('refuses the export without a valid session', async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });
  const noCookie = await anonymous.get('/api/transactions/export');
  expect(noCookie.status()).toBe(401);
  await anonymous.dispose();

  const forged = await playwright.request.newContext({
    baseURL,
    storageState: SIGNED_OUT,
    extraHTTPHeaders: { cookie: 'fm_session=not-a-real-session' },
  });
  const badCookie = await forged.get('/api/transactions/export', { maxRedirects: 0 });
  expect(badCookie.status()).toBe(401);
  expect(await badCookie.text()).not.toContain('Bank,Account');
  await forged.dispose();
});
