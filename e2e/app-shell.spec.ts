import { expect, test, type Page } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { SIGNED_OUT } from './support/auth';
import { classifyEverything } from './support/attention';
import { withServices } from './support/services';

test('the top bar marks the current page among its pills', async ({ page }) => {
  await page.goto('/transactions');

  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Analytics', 'Dashboards', 'Transactions', 'Accounts', 'Categories']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Accounts' }).click();

  await expect(page).toHaveURL(/\/accounts$/);
  await expect(nav.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Transactions' })).not.toHaveAttribute('aria-current');
});

test('More holds every other page, by group, and closes when a link is followed', async ({
  page,
}) => {
  await page.goto('/transactions');
  const more = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More' });

  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  for (const group of ['Overview', 'Money', 'Organize', 'System']) {
    await expect(page.getByRole('list', { name: group })).toBeVisible();
  }

  await page.getByRole('list', { name: 'Organize' }).getByRole('link', { name: 'Payees' }).click();

  await expect(page).toHaveURL(/\/payees$/);
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  await more.click();
  await expect(
    page.getByRole('list', { name: 'Organize' }).getByRole('link', { name: 'Payees' }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toBeFocused();
});

test("the top bar's actions lead to the Accounts to import into and the unclassified inbox", async ({
  page,
}) => {
  await page.goto('/categories');

  await page.getByRole('link', { name: 'Review unclassified' }).click();
  await expect(page).toHaveURL(/\/unclassified$/);

  await page.getByRole('link', { name: 'Import statement' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
});

/** The bell in the top bar, and the popover it opens. */
function bell(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Notifications' });
}
function bellPopover(page: Page) {
  return page.getByRole('dialog', { name: /Needs attention/ });
}

test('the bell lists the Unclassified Transactions and leads to Unclassified', async ({ page }) => {
  const suffix = Date.now();
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Bell bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      name: `Bell account ${suffix}`,
      currency: 'CHF',
      kind: 'current',
      importFormat: null,
      openingBalanceMinor: 0,
      openingDate: '2025-01-01',
    });
    await createManualTransaction(ctx, {
      accountId: account.id,
      bookingDate: '2025-04-02',
      amountMinor: -4_50,
      description: `Bell kiosk ${suffix}`,
    });
  });

  await page.goto('/categories');
  await bell(page).click();
  await expect(bell(page)).toHaveAttribute('aria-expanded', 'true');
  const item = bellPopover(page).getByRole('link', {
    name: /^\d+ Transactions? (is|are) Unclassified$/,
  });
  await expect(item).toBeVisible();
  await expect(bellPopover(page)).toHaveAccessibleName('Needs attention 1');

  await item.click();
  await expect(page).toHaveURL(/\/unclassified$/);
  await expect(bellPopover(page)).toBeHidden();
});

test('the bell works from the keyboard, and Escape gives focus back to it', async ({ page }) => {
  await page.goto('/categories');
  await bell(page).focus();
  await page.keyboard.press('Enter');
  await expect(bellPopover(page)).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(bellPopover(page).getByRole('link').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(bellPopover(page)).toBeHidden();
  await expect(bell(page)).toBeFocused();
});

test('with nothing to act on, the bell says Nothing needs attention', async ({ page }) => {
  // The E2E database is shared by the whole run: classify whatever earlier specs left.
  await withServices(async (ctx) => {
    const group = await createCategoryGroup(ctx, { name: `Bell ${Date.now()}`, type: 'expense' });
    const category = await createCategory(ctx, { groupId: group.id, name: 'Everything' });
    await classifyEverything(ctx, category.id);
  });

  await page.goto('/categories');
  await bell(page).click();

  await expect(bellPopover(page)).toHaveAccessibleName('Needs attention 0');
  await expect(bellPopover(page)).toContainText('Nothing needs attention');
  await expect(bellPopover(page).getByRole('link')).toHaveCount(0);
});

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('there is no bell', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Notifications' })).toHaveCount(0);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the bell sits in the top bar and its popover stays within the gutters', async ({
    page,
  }) => {
    await page.goto('/transactions');
    await expect(bell(page)).toBeVisible();

    await bell(page).click();
    const box = (await bellPopover(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 16);
  });

  test.use({ viewport: { width: 390, height: 844 } });

  test('every page is in a drawer opened from the top bar', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await drawer.getByRole('link', { name: 'Payees' }).click();

    await expect(page).toHaveURL(/\/payees$/);
    await expect(drawer).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });
});
