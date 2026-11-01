import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openAccountPage, openNewAccountForm } from './support/accounts';

const UBS_OCTOBER = path.join(
  import.meta.dirname,
  '../test/fixtures/import/ubs/ubs-chf-2025-10.csv',
);
/** The Télécom row (-64.90 on 2025-10-15), renumbered to make it a near-duplicate. */
const TELECOM_REFERENCE = '9930288TI0000107';
const RENUMBERED_REFERENCE = '9930288TI0000999';

test('reviews a near-duplicate side by side, deletes one imported Transaction, and undoes an Import', async ({
  page,
}, testInfo) => {
  page.on('dialog', (dialog) => void dialog.accept());
  const renumbered = testInfo.outputPath('ubs-chf-2025-10-renumbered.csv');
  writeFileSync(
    renumbered,
    readFileSync(UBS_OCTOBER, 'utf8').replace(TELECOM_REFERENCE, RENUMBERED_REFERENCE),
  );
  // Shared E2E database: unique names, and no IBAN on the Account (IBANs are unique)
  const suffix = Date.now();
  const bankName = `UBS undo ${suffix}`;
  const accountName = `UBS undo ${suffix}`;

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
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();

  // October, then the same file with the Télécom row renumbered
  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(UBS_OCTOBER);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Commit import (14 new)' }).click();
  await expect(page.getByText("Balance CHF 12'903.05")).toBeVisible();

  await page.getByLabel('Bank file (UBS CSV)').setInputFiles(renumbered);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByRole('heading', { name: 'Possible duplicates' })).toBeVisible();
  const pair = page.getByRole('table', { name: `Possible duplicate ${RENUMBERED_REFERENCE}` });
  await expect(pair.getByRole('row', { name: /In this file/ })).toContainText(RENUMBERED_REFERENCE);
  await expect(pair.getByRole('row', { name: /Already on the Account/ })).toContainText(
    TELECOM_REFERENCE,
  );
  await expect(pair.getByRole('row', { name: /Already on the Account/ })).toContainText('-64.90');
  await expect(page.getByRole('radio', { name: 'Skip' })).toBeChecked();

  // Keep it: the second Télécom bill is added
  await page.getByRole('radio', { name: 'Keep' }).check();
  await page.getByRole('button', { name: /Commit import/ }).click();
  await expect(page.getByRole('heading', { name: accountName })).toBeVisible();
  await expect(page.getByText("Balance CHF 12'838.15")).toBeVisible();

  // It was a bank error after all: delete that one Transaction
  await page.getByRole('link', { name: 'ubs-chf-2025-10-renumbered.csv' }).click();
  await expect(
    page.getByRole('heading', { name: /Import ubs-chf-2025-10-renumbered.csv/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Delete ${RENUMBERED_REFERENCE}` }).click();
  await expect(page.getByText('No Transactions left from this Import.')).toBeVisible();

  // Undo October: its Transactions go, and the Account is as before its first Import
  await page.getByRole('link', { name: `← ${accountName}` }).click();
  await expect(page.getByText("Balance CHF 12'903.05")).toBeVisible();
  await page.getByRole('link', { name: 'ubs-chf-2025-10.csv' }).click();
  await expect(page.getByRole('table', { name: 'Transactions' }).locator('tbody tr')).toHaveCount(
    14,
  );
  await page.getByRole('button', { name: 'Undo import' }).click();
  await expect(page.getByText('This Import was undone.')).toBeVisible();
  await page.getByRole('link', { name: `← ${accountName}` }).click();
  await expect(page.getByText('Balance CHF 0.00')).toBeVisible();
  const octoberRow = page
    .getByRole('table', { name: 'Imports' })
    .locator('tbody tr')
    .filter({ hasText: 'ubs-chf-2025-10.csv' });
  await expect(octoberRow).toContainText('Undone');
});
