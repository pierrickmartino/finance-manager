import { expect, test as setup } from '@playwright/test';
import {
  OWNER_PASSWORD,
  OWNER_STORAGE_STATE,
  saveOwnerCredentials,
  signIn,
  signOut,
  totpCode,
} from './support/auth';

setup('first-run setup with TOTP, sign out, then sign in', async ({ page }) => {
  // The run's database is empty, so every page leads to setup.
  await page.goto('/banks');
  await expect(page).toHaveURL(/\/setup$/);

  const totpSecret = (await page.getByTestId('totp-secret').textContent())!.trim();
  await expect(page.getByRole('img', { name: 'Authenticator QR code' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByLabel('Repeat password').fill(OWNER_PASSWORD);
  await page.getByLabel('Authenticator code').fill(totpCode(totpSecret));
  await page.getByRole('button', { name: 'Complete setup' }).click();

  const codes = page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(codes).toHaveCount(10);
  const recoveryCodes = (await codes.allTextContents()).map((code) => code.trim());
  saveOwnerCredentials({ password: OWNER_PASSWORD, totpSecret, recoveryCodes });

  await page.getByRole('link', { name: 'I have saved them, continue' }).click();
  // Setup seeded the starter Dashboard, which is the landing page.
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  await signOut(page);
  await page.goto('/banks');
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  await page.context().storageState({ path: OWNER_STORAGE_STATE });
});
