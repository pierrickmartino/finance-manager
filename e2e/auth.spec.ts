import { expect, test } from '@playwright/test';
import { loadOwnerCredentials, SIGNED_OUT, signIn } from './support/auth';

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('protected pages send you to the login page', async ({ page }) => {
    for (const path of ['/', '/banks', '/settings']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('a made-up session cookie is not accepted', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'fm_session', value: 'made-up', url: baseURL! }]);

    await page.goto('/banks');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('the setup screen is gone once setup is complete', async ({ page }) => {
    await page.goto('/setup');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('a wrong code is refused', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Password').fill(loadOwnerCredentials().password);
    await page.getByLabel('Authenticator or recovery code').fill('000000');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Wrong password or code')).toHaveRole('alert');
  });

  test('a recovery code signs you in', async ({ page }, testInfo) => {
    // One code per attempt: a retry must not reuse a code the first attempt spent.
    const code = loadOwnerCredentials().recoveryCodes[testInfo.retry]!;

    await signIn(page, code);

    // The landing page is the first Dashboard.
    await expect(page).toHaveURL(/\/dashboards\//);
  });
});

test('an operation submitted after the session ended is rejected', async ({ page, context }) => {
  const name = `Expired ${Date.now()}`;
  await page.goto('/banks');
  // The session ends (as after 30 idle minutes) while the form is open.
  const session = (await context.cookies()).find((cookie) => cookie.name === 'fm_session')!;
  await context.addCookies([{ ...session, value: 'expired' }]);

  await page.getByLabel('Bank name').fill(name);
  await page.getByRole('button', { name: 'Add Bank' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await page.goto('/banks');
  await expect(page.getByRole('heading', { name: 'Banks' })).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
});
