import { expect, test } from '@playwright/test';

test('the top bar marks the current page among its pills, and the hero says where you are', async ({
  page,
}) => {
  await page.goto('/transactions');

  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Dashboards', 'Transactions', 'Accounts', 'Categories']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('breadcrumb')).toHaveText('Money/Transactions');
  await expect(page.getByText(/^Good (morning|afternoon|evening)\.$/)).toBeVisible();

  await nav.getByRole('link', { name: 'Accounts' }).click();

  await expect(page).toHaveURL(/\/accounts$/);
  await expect(nav.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Transactions' })).not.toHaveAttribute('aria-current');
  await expect(page.getByTestId('breadcrumb')).toHaveText('Money/Accounts');
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
  await expect(page.getByTestId('breadcrumb')).toHaveText('Organize/Payees');

  await more.click();
  await expect(
    page.getByRole('list', { name: 'Organize' }).getByRole('link', { name: 'Payees' }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toBeFocused();
});

test("the hero's actions lead to the Accounts to import into and the unclassified inbox", async ({
  page,
}) => {
  await page.goto('/categories');

  await page.getByRole('link', { name: 'Review unclassified' }).click();
  await expect(page).toHaveURL(/\/unclassified$/);

  await page.getByRole('link', { name: 'Import statement' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
});

test.describe('on a phone', () => {
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
