/**
 * The E2E owner account. `e2e/auth.setup.ts` completes first-run setup once per run, saves the
 * signed-in browser state to OWNER_STORAGE_STATE (every `chromium` test starts from it) and
 * the credentials to a JSON file that tests can read back to sign in again.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { TOTP } from 'otpauth';

const AUTH_DIR = path.resolve('e2e/.auth');
export const OWNER_STORAGE_STATE = path.join(AUTH_DIR, 'owner.json');
const CREDENTIALS_FILE = path.join(AUTH_DIR, 'owner-credentials.json');

export const OWNER_PASSWORD = 'e2e owner passphrase';

/** For `test.use({ storageState: SIGNED_OUT })` in tests that need a fresh, anonymous browser. */
export const SIGNED_OUT = { cookies: [], origins: [] };

export interface OwnerCredentials {
  password: string;
  totpSecret: string;
  recoveryCodes: string[];
}

export function saveOwnerCredentials(credentials: OwnerCredentials): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
}

export function loadOwnerCredentials(): OwnerCredentials {
  return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8')) as OwnerCredentials;
}

/** The code an authenticator app shows right now. */
export function totpCode(secret: string): string {
  return new TOTP({ secret }).generate();
}

/** Signs in through the login page, with a TOTP code unless another code is given. */
export async function signIn(page: Page, code?: string): Promise<void> {
  const { password, totpSecret } = loadOwnerCredentials();
  await page.goto('/login');
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Authenticator or recovery code').fill(code ?? totpCode(totpSecret));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}
