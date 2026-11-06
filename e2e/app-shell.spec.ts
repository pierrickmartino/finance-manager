import { expect, test, type Page } from '@playwright/test';

test('the sidebar groups every page and marks the current one', async ({ page }) => {
  await page.goto('/transactions');

  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const group of ['Overview', 'Money', 'Organize', 'System']) {
    await expect(nav.getByRole('list', { name: group })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByTestId('breadcrumb')).toHaveText('Money/Transactions');

  await nav.getByRole('link', { name: 'Payees' }).click();

  await expect(page).toHaveURL(/\/payees$/);
  await expect(nav.getByRole('link', { name: 'Payees' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Transactions' })).not.toHaveAttribute('aria-current');
  await expect(page.getByTestId('breadcrumb')).toHaveText('Organize/Payees');
});

test.describe('collapsing the sidebar', () => {
  const sidebar = (page: Page) => page.getByTestId('sidebar');
  const pin = (page: Page) => page.getByRole('button', { name: 'Pin menu' });

  test('unpinning leaves a rail that peeks open on hover and is remembered', async ({ page }) => {
    await page.goto('/transactions');
    await expect(sidebar(page)).toHaveAttribute('data-state', 'pinned');
    await expect(pin(page)).toHaveAttribute('aria-pressed', 'true');

    await pin(page).click();
    await page.mouse.move(900, 400);
    await expect(sidebar(page)).toHaveAttribute('data-state', 'rail');
    await expect(pin(page)).toBeHidden();

    // Every link stays reachable by name from the rail, and shows its icon.
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Payees' }).locator('svg')).toBeVisible();
    await nav.getByRole('link', { name: 'Payees' }).hover();
    await expect(sidebar(page)).toHaveAttribute('data-state', 'peeking');
    await expect(pin(page)).toHaveAttribute('aria-pressed', 'false');

    await page.mouse.move(900, 400);
    await expect(sidebar(page)).toHaveAttribute('data-state', 'rail');

    await page.reload();
    await expect(sidebar(page)).toHaveAttribute('data-state', 'rail');

    await nav.getByRole('link', { name: 'Payees' }).hover();
    await pin(page).click();
    await expect(sidebar(page)).toHaveAttribute('data-state', 'pinned');
    await page.reload();
    await expect(sidebar(page)).toHaveAttribute('data-state', 'pinned');
  });

  test('following a link from the peek closes it', async ({ page }) => {
    await page.goto('/transactions');
    await pin(page).click();
    await page.mouse.move(900, 400);

    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Payees' }).click();

    await expect(page).toHaveURL(/\/payees$/);
    await expect(sidebar(page)).toHaveAttribute('data-state', 'rail');
    await expect(nav.getByRole('link', { name: 'Payees' })).toHaveAttribute('aria-current', 'page');
  });

  test('the keyboard opens the peek on focus and Escape closes it', async ({ page }) => {
    await page.goto('/transactions');
    await pin(page).click();
    await page.mouse.move(900, 400);
    await expect(sidebar(page)).toHaveAttribute('data-state', 'rail');

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Accounts' })
      .focus();
    await expect(sidebar(page)).toHaveAttribute('data-state', 'peeking');

    await page.keyboard.press('Escape');
    await expect(sidebar(page)).toHaveAttribute('data-state', 'rail');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the sidebar is a drawer opened from the top bar', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await drawer.getByRole('link', { name: 'Categories' }).click();

    await expect(page).toHaveURL(/\/categories$/);
    await expect(drawer).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });
});
