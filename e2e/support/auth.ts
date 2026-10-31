/**
 * The E2E owner account. `e2e/auth.setup.ts` completes first-run setup once per run, saves the
 * signed-in browser state to OWNER_STORAGE_STATE (every `chromium` test starts from it) and
 * the credentials to a JSON file that tests can read back to sign in again.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
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
  /** The TOTP time step of the last code used: the app accepts each code once. */
  lastTotpStep: number;
}

const TOTP_PERIOD_MS = 30_000;

export function saveOwnerCredentials(credentials: OwnerCredentials): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
}

export function loadOwnerCredentials(): OwnerCredentials {
  return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8')) as OwnerCredentials;
}

/** The current code and its 30-second time step, read from one clock reading. */
export function currentTotp(secret: string): { code: string; step: number } {
  const timestamp = Date.now();
  return {
    code: new TOTP({ secret }).generate({ timestamp }),
    step: Math.floor(timestamp / TOTP_PERIOD_MS),
  };
}

/**
 * A TOTP code the app has not seen yet. A code works once, so this waits for the next 30-second
 * step when the current one was already used, and remembers the step it hands out.
 */
async function unusedTotpCode(): Promise<string> {
  const credentials = loadOwnerCredentials();
  const nextStepAt = (credentials.lastTotpStep + 1) * TOTP_PERIOD_MS;
  if (Date.now() < nextStepAt) {
    test.info().setTimeout(test.info().timeout + TOTP_PERIOD_MS);
    await new Promise((resolve) => setTimeout(resolve, nextStepAt - Date.now() + 50));
  }
  const { code, step } = currentTotp(credentials.totpSecret);
  saveOwnerCredentials({ ...credentials, lastTotpStep: step });
  return code;
}

/** Signs in through the login page, with a TOTP code unless another code is given. */
export async function signIn(page: Page, code?: string): Promise<void> {
  const { password } = loadOwnerCredentials();
  await page.goto('/login');
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Authenticator or recovery code').fill(code ?? (await unusedTotpCode()));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}
