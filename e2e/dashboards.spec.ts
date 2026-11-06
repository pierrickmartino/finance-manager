import { expect, test, type Page } from '@playwright/test';

/** A Widget card on the grid; its `data-layout` is `x,y,w,h`. */
function layoutOf(page: Page, name: string) {
  return page.getByRole('region', { name, exact: true });
}

test('the starter Dashboard is the landing page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/dashboards\//);
  for (const name of [
    'Income vs. expense',
    'Net cash flow',
    'Spending by Category',
    'Account balances in CHF',
  ]) {
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }
});

test('a Dashboard opens as its Story; Edit Dashboard opens the grid and Done returns', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  // The Story tells each Widget as a chapter, without the grid's Widget actions.
  await expect(page.getByRole('heading', { name: 'Net cash flow', level: 2 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add Widget' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Edit Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboards\/[^/]+\/edit$/);
  await expect(page.getByRole('link', { name: 'Add Widget' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Net cash flow' })).toBeVisible();

  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/dashboards\/[^/]+$/);
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
});

test('create a Dashboard, add a stacked bar Widget, move it, and the layout persists', async ({
  page,
}) => {
  const dashboardName = `Dash ${Date.now()}`;
  const widgetName = `Spending ${Date.now()}`;

  await page.goto('/dashboards');
  await page.getByLabel('Dashboard name').fill(dashboardName);
  await page.getByRole('button', { name: 'Create Dashboard' }).click();
  await expect(page.getByRole('heading', { name: dashboardName, level: 1 })).toBeVisible();
  await expect(page.getByText('No Widgets yet')).toBeVisible();

  await page.getByRole('link', { name: 'Add Widget' }).click();
  await page.getByRole('group', { name: 'Visualisation' }).getByText('Stacked bar').click();
  await expect(page).toHaveURL(/[?&]vis=stacked_bar/);
  await expect(page.getByRole('radio', { name: 'Stacked bar' })).toBeChecked();
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();

  await expect(page.getByRole('heading', { name: dashboardName, level: 1 })).toBeVisible();
  const card = layoutOf(page, widgetName);
  await expect(card).toHaveAttribute('data-layout', '0,0,6,8');

  // Drag the Widget by its handle to the right half of the grid.
  const handle = page.getByRole('button', { name: `Move ${widgetName}` });
  const box = (await handle.boundingBox())!;
  const gridWidth = (await card.boundingBox())!.width * 2;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const saved = page.waitForResponse((response) => response.request().method() === 'POST');
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(box.x + box.width / 2 + (gridWidth / 2) * (step / 10), box.y + 5);
  }
  await page.mouse.up();
  await expect(card).toHaveAttribute('data-layout', '6,0,6,8');
  await saved;

  await page.reload();
  await expect(layoutOf(page, widgetName)).toHaveAttribute('data-layout', '6,0,6,8');
  await expect(page.getByRole('figure', { name: `${widgetName} stacked bar chart` })).toBeVisible();
});

test('a Widget moves with the arrow keys on its handle, and the move is saved', async ({
  page,
}) => {
  const dashboardName = `Keys ${Date.now()}`;
  await page.goto('/dashboards');
  await page.getByLabel('Dashboard name').fill(dashboardName);
  await page.getByRole('button', { name: 'Create Dashboard' }).click();
  await expect(page.getByRole('heading', { name: dashboardName, level: 1 })).toBeVisible();
  const cards = page.getByRole('region', { name: 'Account balances in CHF', exact: true });
  for (const count of [1, 2]) {
    await page.getByRole('button', { name: 'Add Account balances' }).click();
    await expect(cards).toHaveCount(count);
  }
  await expect(cards.nth(1)).toHaveAttribute('data-layout', '0,8,6,8');

  const handle = cards.nth(1).getByRole('button', { name: 'Move Account balances in CHF' });
  await handle.focus();
  const saved = page.waitForResponse((response) => response.request().method() === 'POST');
  await page.keyboard.press('ArrowRight');
  await saved;
  await expect(page.locator('[data-layout="1,8,6,8"]')).toHaveCount(1);
  await expect(handle).toBeFocused();

  await page.reload();
  await expect(page.locator('[data-layout="1,8,6,8"]')).toHaveCount(1);
});

test('add an existing Widget from the Widgets page to a Dashboard as a copy', async ({ page }) => {
  const dashboardName = `Saved ${Date.now()}`;
  const widgetName = `Standalone ${Date.now()}`;

  await page.goto('/widgets/new');
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();
  await expect(page.getByRole('heading', { name: widgetName, level: 1 })).toBeVisible();

  await page.goto('/dashboards');
  await page.getByLabel('Dashboard name').fill(dashboardName);
  await page.getByRole('button', { name: 'Create Dashboard' }).click();
  await expect(page.getByRole('heading', { name: dashboardName, level: 1 })).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Widget', exact: true })
    .selectOption({ label: `${widgetName} (No Dashboard)` });
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(layoutOf(page, widgetName)).toHaveAttribute('data-layout', '0,0,6,8');
  await expect(
    page.getByRole('combobox', { name: 'Widget', exact: true }).getByRole('option'),
  ).toContainText([`${widgetName} (No Dashboard)`, `${widgetName} (${dashboardName})`]);
});
