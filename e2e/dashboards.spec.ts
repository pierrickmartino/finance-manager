import { expect, test, type Page } from '@playwright/test';

/** The chapter titles, in the order the page tells them. */
function chapterTitles(page: Page) {
  return page.locator('h2[id^="chapter-"]');
}

/** Creates a Dashboard; it opens in Edit mode, still empty. */
async function createDashboard(page: Page, name: string): Promise<void> {
  await page.goto('/dashboards');
  await page.getByLabel('Dashboard name').fill(name);
  await page.getByRole('button', { name: 'Create Dashboard' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.getByText('No Widgets yet')).toBeVisible();
}

/** Waits for the next server action (a POST) to answer. */
function nextAction(page: Page) {
  return page.waitForResponse((response) => response.request().method() === 'POST');
}

test('the starter Dashboard is the landing page: an overview row, then a card per Widget', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/dashboards\//);
  await expect(page.getByRole('heading', { name: 'Recent activity', level: 2 })).toBeVisible();
  for (const name of [
    'Income vs. expense',
    'Net cash flow',
    'Spending by Category',
    'Account balances in CHF',
  ]) {
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }
});

test('a Dashboard opens as its Story; Edit mode lists the same Widgets in order, and Done returns', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  const storyOrder = await chapterTitles(page).allTextContents();
  await expect(page.getByText('Add chapter')).toHaveCount(0);

  await page.getByRole('link', { name: 'Edit Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboards\/[^/]+\/edit$/);
  await expect(page.getByText('Editing', { exact: true })).toBeVisible();
  await expect(chapterTitles(page)).toHaveText(storyOrder);
  // Which Widgets the hero comes from (none yet on an empty database).
  await expect(page.getByText(/^(Hero: number from|No hero yet)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Net cash flow up' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit Net cash flow' })).toBeVisible();

  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/dashboards\/[^/]+$/);
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
});

test('add a stacked bar Widget from the empty Dashboard; the editor previews its chapter', async ({
  page,
}) => {
  const dashboardName = `Dash ${Date.now()}`;
  const widgetName = `Spending ${Date.now()}`;
  await createDashboard(page, dashboardName);

  await page.getByRole('link', { name: 'New Widget' }).click();
  await expect(page).toHaveURL(/[?&]at=0/);
  await page.getByRole('group', { name: 'Visualisation' }).getByText('Stacked bar').click();
  await expect(page).toHaveURL(/[?&]vis=stacked_bar/);
  await expect(page.getByRole('radio', { name: /Stacked bar/ })).toBeChecked();
  await expect(page.getByRole('tab', { name: 'Story', selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New Widget', level: 2 })).toBeVisible();
  await page.getByRole('tab', { name: 'Data' }).click();
  await expect(page.getByRole('table', { name: 'Pivot' })).toBeVisible();
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();

  await expect(page.getByRole('heading', { name: dashboardName, level: 1 })).toBeVisible();
  await expect(chapterTitles(page)).toHaveText([widgetName]);
});

test('duplicate places the copy right after its original; the arrows reorder and the order persists', async ({
  page,
}) => {
  const original = 'Account balances in CHF';
  const copy = `${original} (copy)`;
  await createDashboard(page, `Order ${Date.now()}`);

  await page
    .getByRole('form', { name: 'Add Account balances as chapter 1' })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([original]);
  await page
    .getByRole('form', { name: `Duplicate ${original}` })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([original, copy]);

  const saved = nextAction(page);
  await page.getByRole('button', { name: `Move ${copy} up` }).click();
  await saved;
  await expect(chapterTitles(page)).toHaveText([copy, original]);
  // At the top it can't go further up, so focus moves to its other arrow.
  await expect(page.getByRole('button', { name: `Move ${copy} down` })).toBeFocused();

  await page.reload();
  await expect(chapterTitles(page)).toHaveText([copy, original]);
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(chapterTitles(page)).toHaveText([copy, original]);
});

test('a chapter added between two others goes there', async ({ page }) => {
  const widgetName = `Between ${Date.now()}`;
  await createDashboard(page, `Slots ${Date.now()}`);
  const balances = 'Account balances in CHF';
  await page
    .getByRole('form', { name: 'Add Account balances as chapter 1' })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([balances]);
  await page
    .getByRole('form', { name: `Duplicate ${balances}` })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([balances, `${balances} (copy)`]);

  await page.getByText('Add chapter 2').click();
  await page.getByRole('link', { name: 'New Widget' }).locator('visible=true').click();
  await expect(page).toHaveURL(/[?&]at=1/);
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();

  await expect(chapterTitles(page)).toHaveText([balances, widgetName, `${balances} (copy)`]);
});

test('add an existing Widget from the Widgets page to a Dashboard as a copy', async ({ page }) => {
  const dashboardName = `Saved ${Date.now()}`;
  const widgetName = `Standalone ${Date.now()}`;

  await page.goto('/widgets/new');
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();
  await expect(page.getByRole('heading', { name: widgetName, level: 1 })).toBeVisible();

  await createDashboard(page, dashboardName);
  await page
    .getByRole('combobox', { name: 'Existing Widget' })
    .selectOption({ label: `${widgetName} (No Dashboard)` });
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(chapterTitles(page)).toHaveText([widgetName]);
  await page.getByText('Add chapter 2').click();
  await expect(
    page.getByRole('combobox', { name: 'Existing Widget' }).last().getByRole('option'),
  ).toContainText([`${widgetName} (No Dashboard)`, `${widgetName} (${dashboardName})`]);
});
