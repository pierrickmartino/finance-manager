import { expect, test, type Page } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import {
  addWidget,
  createDashboard as createDashboardRecord,
} from '../src/server/services/dashboards';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import {
  arrangeCard,
  cardBox,
  dragCard,
  nextAction,
  resizeCard,
  stepWithKey,
  widgetCard,
} from './support/dashboards';
import { withServices } from './support/services';

/** The chapter titles, in the order the page tells them. */
function chapterTitles(page: Page) {
  return page.locator('h2[id^="chapter-"]');
}

/** In Edit mode: adds the Account balances, from the empty Dashboard or from Add Widget. */
async function addBalances(page: Page): Promise<void> {
  const menu = page.getByText('Add Widget', { exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('form', { name: 'Add Account balances' }).getByRole('button').click();
}

/** Creates a Dashboard; it opens in Edit mode, still empty. */
async function createDashboard(page: Page, name: string): Promise<void> {
  await page.goto('/dashboards');
  await page.getByLabel('Dashboard name').fill(name);
  await page.getByRole('button', { name: 'Create Dashboard' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.getByText('No Widgets yet')).toBeVisible();
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
  // The same overview row above the board, then each card with its toolbar.
  await expect(page.getByRole('heading', { name: 'Recent activity', level: 2 })).toBeVisible();
  const toolbar = page.getByRole('toolbar', { name: 'Net cash flow actions' });
  await expect(toolbar.getByRole('button', { name: 'Move Net cash flow' })).toBeVisible();
  await expect(toolbar.getByRole('link', { name: 'Edit Net cash flow' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Duplicate' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Remove' })).toBeVisible();
  await expect(page.getByText('Add Widget', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/dashboards\/[^/]+$/);
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
});

test('add a stacked bar Widget from the empty Dashboard; the editor previews its card', async ({
  page,
}) => {
  const dashboardName = `Dash ${Date.now()}`;
  const widgetName = `Spending ${Date.now()}`;
  await createDashboard(page, dashboardName);

  await page.getByRole('link', { name: 'New Widget' }).click();
  await expect(page).toHaveURL(/[?&]dashboard=/);
  await page.getByRole('group', { name: 'Visualisation' }).getByText('Stacked bar').click();
  await expect(page).toHaveURL(/[?&]vis=stacked_bar/);
  await expect(page.getByRole('radio', { name: /Stacked bar/ })).toBeChecked();
  await expect(page.getByRole('tab', { name: 'Card', selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New Widget', level: 2 })).toBeVisible();
  await page.getByRole('tab', { name: 'Data' }).click();
  await expect(page.getByRole('table', { name: 'Pivot' })).toBeVisible();
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();

  await expect(page.getByRole('heading', { name: dashboardName, level: 1 })).toBeVisible();
  await expect(chapterTitles(page)).toHaveText([widgetName]);
});

test('drag a card by its handle and resize it from its corner; both views keep it after a reload', async ({
  page,
}) => {
  const original = 'Account balances in CHF';
  const copy = `${original} (copy)`;
  await createDashboard(page, `Grid ${Date.now()}`);
  await addBalances(page);
  await expect(chapterTitles(page)).toHaveText([original]);
  await page
    .getByRole('form', { name: `Duplicate ${original}` })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([original, copy]);
  // Balances start 4×6: the copy sits right of its original on the same row.
  const before = { original: await cardBox(page, original), copy: await cardBox(page, copy) };
  expect(before.copy.x).toBeGreaterThan(before.original.x + before.original.width);
  expect(before.copy.y).toBeCloseTo(before.original.y, 0);

  // Onto the copy's place: the copy is pushed down under it, and the first columns stay empty.
  await dragCard(page, original, 4, 0);
  // Two columns wider and two rows taller: the copy below is pushed further down.
  await resizeCard(page, original, 2, 2);
  // A Balances card can't go under 3 columns: shrinking the copy by 3 stops at 3.
  await resizeCard(page, copy, -3, 0);

  const expectSavedBoard = async () => {
    const [moved, pushed] = [await cardBox(page, original), await cardBox(page, copy)];
    expect(moved.x).toBeCloseTo(before.copy.x, 0);
    expect(moved.width).toBeGreaterThan(before.original.width * 1.4);
    expect(moved.height).toBeGreaterThan(before.original.height * 1.2);
    expect(pushed.x).toBeCloseTo(moved.x, 0);
    expect(pushed.y).toBeGreaterThan(moved.y + moved.height);
    expect(pushed.width).toBeLessThan(before.copy.width);
    expect(pushed.width).toBeGreaterThan(before.copy.width * 0.6);
    return { moved, pushed };
  };
  const edited = await expectSavedBoard();

  await page.reload();
  await expect(page.getByText('Editing', { exact: true })).toBeVisible();
  const reloaded = await expectSavedBoard();
  expect(reloaded.moved.width).toBeCloseTo(edited.moved.width, 0);
  expect(reloaded.moved.height).toBeCloseTo(edited.moved.height, 0);

  // The Dashboard Story draws the same places and sizes.
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
  const story = await expectSavedBoard();
  expect(story.moved.width).toBeCloseTo(edited.moved.width, 0);
  expect(story.moved.height).toBeCloseTo(edited.moved.height, 0);
  expect(story.pushed.y - story.moved.y).toBeCloseTo(edited.pushed.y - edited.moved.y, 0);
});

test('move and resize a focused card from the keyboard; each step is announced and kept after a reload', async ({
  page,
}) => {
  const original = 'Account balances in CHF';
  const copy = `${original} (copy)`;
  await createDashboard(page, `Keys ${Date.now()}`);
  await addBalances(page);
  await page
    .getByRole('form', { name: `Duplicate ${original}` })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([original, copy]);
  const before = await cardBox(page, copy);

  // The copy starts 4×6 at column 5, row 1 (right of its original).
  const card = arrangeCard(page, copy);
  const announced = page.getByTestId('board-announcement');
  await card.focus();
  await stepWithKey(page, 'ArrowRight');
  await expect(announced).toHaveText('Moved to column 6, row 1');
  await expect(card).toBeFocused();
  await stepWithKey(page, 'ArrowRight');
  await expect(announced).toHaveText('Moved to column 7, row 1');
  await stepWithKey(page, 'Shift+ArrowDown');
  await expect(announced).toHaveText('Resized to 4 by 7');
  await expect(card).toBeFocused();
  // At the top already: nothing moves, and it says so.
  await page.keyboard.press('ArrowUp');
  await expect(announced).toHaveText('Already at the top');

  const expectSavedBoard = async () => {
    const moved = await cardBox(page, copy);
    expect(moved.x).toBeGreaterThan(before.x + 1.5 * (before.width / 4));
    expect(moved.y).toBeCloseTo(before.y, 0);
    expect(moved.height).toBeCloseTo(before.height + 60, 0);
  };
  await expectSavedBoard();
  await page.reload();
  await expect(page.getByText('Editing', { exact: true })).toBeVisible();
  await expectSavedBoard();
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
  await expectSavedBoard();
});

test('a Widget added from Add Widget goes in the first free spot; removing one leaves its space', async ({
  page,
}) => {
  const widgetName = `Free spot ${Date.now()}`;
  await createDashboard(page, `Add ${Date.now()}`);
  const balances = 'Account balances in CHF';
  const copy = `${balances} (copy)`;
  await addBalances(page);
  await expect(chapterTitles(page)).toHaveText([balances]);
  await page
    .getByRole('form', { name: `Duplicate ${balances}` })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([balances, copy]);

  await page.getByText('Add Widget', { exact: true }).click();
  await page.getByRole('link', { name: 'New Widget' }).click();
  // A donut starts 4 columns wide (a table, the default, starts 8: too wide for this row).
  await page.getByRole('group', { name: 'Visualisation' }).getByText('Donut').click();
  await expect(page).toHaveURL(/[?&]vis=donut/);
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();
  await expect(chapterTitles(page)).toHaveText([balances, copy, widgetName]);

  // At lg the board is the grid: the duplicate sits right of its original, the new Widget next
  // to it, all on one row (4 columns each), the shorter cards not stretched to the taller one.
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
  const box = (name: string) => cardBox(page, name);
  let [original, duplicate, added] = [await box(balances), await box(copy), await box(widgetName)];
  expect(duplicate.x).toBeGreaterThan(original.x + original.width);
  expect(added.x).toBeGreaterThan(duplicate.x + duplicate.width);
  expect(duplicate.y).toBeCloseTo(original.y, 0);
  expect(added.y).toBeCloseTo(original.y, 0);
  expect(added.height).toBeGreaterThan(original.height);

  // Below lg the cards are one column in reading order.
  await page.setViewportSize({ width: 600, height: 900 });
  [original, duplicate, added] = [await box(balances), await box(copy), await box(widgetName)];
  expect(duplicate.y).toBeGreaterThan(original.y + original.height);
  expect(added.y).toBeGreaterThan(duplicate.y + duplicate.height);
  expect(duplicate.x).toBeCloseTo(original.x, 0);

  // Removing the copy from the grid leaves its space empty: the new Widget stays where it was.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('link', { name: 'Edit Dashboard' }).click();
  await expect(page.getByText('Editing', { exact: true })).toBeVisible();
  const addedBefore = await box(widgetName);
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByRole('form', { name: `Remove ${copy}` })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([balances, widgetName]);
  const addedAfter = await box(widgetName);
  expect(addedAfter.x).toBeCloseTo(addedBefore.x, 0);
  expect(addedAfter.y).toBeCloseTo(addedBefore.y, 0);
});

test('below lg Edit mode is one column with up/down moves that swap places on the grid', async ({
  page,
}) => {
  const original = 'Account balances in CHF';
  const copy = `${original} (copy)`;
  await createDashboard(page, `Narrow ${Date.now()}`);
  await addBalances(page);
  await page
    .getByRole('form', { name: `Duplicate ${original}` })
    .getByRole('button')
    .click();
  await expect(chapterTitles(page)).toHaveText([original, copy]);
  const wide = { original: await cardBox(page, original), copy: await cardBox(page, copy) };
  expect(wide.copy.x).toBeGreaterThan(wide.original.x + wide.original.width);

  // One column in reading order, with no drag or resize handles.
  await page.setViewportSize({ width: 600, height: 900 });
  const [first, second] = [await cardBox(page, original), await cardBox(page, copy)];
  expect(second.y).toBeGreaterThan(first.y + first.height);
  expect(second.x).toBeCloseTo(first.x, 0);
  await expect(page.getByRole('button', { name: `Move ${original}`, exact: true })).toHaveCount(0);
  await expect(page.locator('.react-resizable-handle')).toHaveCount(0);

  // The first card can't go up, the last can't go down.
  const moveButton = (name: string, direction: 'up' | 'down') =>
    page.getByRole('button', { name: `Move ${name} ${direction}`, exact: true });
  await expect(moveButton(original, 'up')).toBeDisabled();
  await expect(moveButton(copy, 'down')).toBeDisabled();

  // Up swaps the copy with its original; focus stays on the arrow that moved it.
  const saved = nextAction(page);
  await moveButton(copy, 'up').click();
  expect((await saved).ok()).toBe(true);
  await expect(chapterTitles(page)).toHaveText([copy, original]);
  await expect(moveButton(copy, 'up')).toBeFocused();
  await expect(moveButton(copy, 'up')).toBeDisabled();

  // At lg, after a reload, the two have swapped places on the grid.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await expect(page.getByText('Editing', { exact: true })).toBeVisible();
  // Polled: right after the reload the grid may not have measured its width yet.
  await expect
    .poll(async () => Math.round((await cardBox(page, copy)).x))
    .toBe(Math.round(wide.original.x));
  const swapped = { original: await cardBox(page, original), copy: await cardBox(page, copy) };
  expect(swapped.copy.x).toBeCloseTo(wide.original.x, 0);
  expect(swapped.original.x).toBeCloseTo(wide.copy.x, 0);
  expect(swapped.copy.y).toBeCloseTo(swapped.original.y, 0);
});

test('changing a Widget to a chart that needs more room grows its card on the Story', async ({
  page,
}) => {
  const widgetName = `Grow ${Date.now()}`;
  await createDashboard(page, `Grow ${Date.now()}`);
  await page.getByRole('link', { name: 'New Widget' }).click();
  await page.getByRole('group', { name: 'Visualisation' }).getByText('Single number').click();
  await page.getByLabel('Widget name').fill(widgetName);
  await page.getByRole('button', { name: 'Save Widget' }).click();
  await expect(chapterTitles(page)).toHaveText([widgetName]);

  // A Single number also heads the overview row; the card is its chapter.
  const card = page
    .getByRole('region', { name: widgetName, exact: true })
    .and(page.locator('[aria-labelledby^="chapter-"]'));
  const cardHeight = async () => {
    const found = await card.boundingBox();
    if (!found) throw new Error(`No card for ${widgetName}`);
    return found.height;
  };
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
  const numberHeight = await cardHeight();

  // A Single number is 3 rows high; a Line needs at least 4.
  await page.getByRole('link', { name: 'Edit Dashboard' }).click();
  await page.getByRole('link', { name: `Edit ${widgetName}` }).click();
  await page
    .getByRole('group', { name: 'Visualisation' })
    .locator('label')
    .filter({ hasText: /^Line/ })
    .click();
  await expect(page).toHaveURL(/[?&]vis=line/);
  await expect(page.getByRole('radio', { name: /^Line/ })).toBeChecked();
  await page.getByRole('button', { name: 'Update Widget' }).click();
  await expect(chapterTitles(page)).toHaveText([widgetName]);
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();

  // One more 40px row and one 20px gap.
  expect(await cardHeight()).toBeCloseTo(numberHeight + 60, 0);
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
  await page.getByText('Add Widget', { exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Existing Widget' }).getByRole('option'),
  ).toContainText([`${widgetName} (No Dashboard)`, `${widgetName} (${dashboardName})`]);
});

test('a table Widget shows its rows and columns as a heatmap whose cells open their Transactions', async ({
  page,
}) => {
  const suffix = Date.now();
  const accountName = `Heatmap account ${suffix}`;
  const dayBefore = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const dashboardId = await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Heatmap bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: accountName,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    for (const [days, amountMinor] of [
      [40, -120_00],
      [70, -2400_00],
    ] as const) {
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: dayBefore(days),
        amountMinor,
        description: `Heatmap ${days}`,
      });
    }
    const dashboard = await createDashboardRecord(ctx, { name: `Heatmap ${suffix}` });
    await addWidget(ctx, dashboard.id, {
      name: 'By Account',
      visualisation: 'table',
      query: {
        dateRange: { kind: 'last', count: 6, unit: 'month' },
        rows: 'account',
        columns: 'month',
      },
    });
    return dashboard.id;
  });

  await page.goto(`/dashboards/${dashboardId}`);
  const heatmap = widgetCard(page, 'By Account').getByRole('table', { name: 'Heatmap' });
  const row = heatmap.getByRole('row').filter({ hasText: accountName });
  await expect(row.getByRole('link', { name: /: CHF -2'400\.00$/ })).toHaveText('2.4k');
  await expect(row.getByRole('link', { name: "CHF -2'520.00" })).toBeVisible();

  await row.getByRole('link', { name: /: CHF -120\.00$/ }).click();
  await expect(page).toHaveURL(/\/widgets\/drill\?/);
  await expect(page.getByRole('table', { name: 'Drill-down Transactions' })).toContainText(
    'Heatmap 40',
  );
});

test("a Donut Widget's card is a ring with the total inside; pointing at a part shows it", async ({
  page,
}) => {
  const suffix = Date.now();
  const dashboardId = await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Ring bank ${suffix}` });
    const account = (name: string) =>
      createAccount(ctx, {
        bankId: bank.id,
        name,
        currency: 'CHF',
        iban: null,
        kind: 'current',
        importFormat: null,
        openingBalanceMinor: 0,
      });
    const rent = await account(`Rent ${suffix}`);
    const food = await account(`Food ${suffix}`);
    const today = swissToday();
    for (const [accountId, amountMinor] of [
      [rent.id, -75_000],
      [food.id, -25_000],
    ] as const) {
      await createManualTransaction(ctx, {
        accountId,
        bookingDate: addDays(today, -3),
        amountMinor,
        description: 'Ring spend',
      });
    }
    const dashboard = await createDashboardRecord(ctx, { name: `Ring ${suffix}` });
    await addWidget(ctx, dashboard.id, {
      name: 'Spend by Account',
      query: {
        dateRange: { kind: 'fixed', from: addDays(today, -10), to: today },
        rows: 'account',
        columns: null,
        filters: { accountIds: [rent.id, food.id] },
      },
      visualisation: 'donut',
    });
    return dashboard.id;
  });

  await page.goto(`/dashboards/${dashboardId}`);
  // The card, not the overview's headline tile, which takes the first Widget's name too.
  const card = page
    .getByRole('region', { name: 'Spend by Account', exact: true })
    .and(page.locator('[aria-labelledby^="chapter-"]'));
  const hole = card.locator('figure > div').first();
  await expect(hole).toContainText('Total');
  await expect(hole).toContainText(/1.000/);

  const rentRow = card.getByRole('link', { name: new RegExp(`Rent ${suffix}`) });
  await expect(rentRow).toContainText('75%');
  await expect(card.getByRole('link', { name: new RegExp(`Food ${suffix}`) })).toContainText('25%');

  await rentRow.hover();
  await expect(hole).toContainText(`Rent ${suffix}`);
  await expect(hole).toContainText('75%');

  await rentRow.click();
  await expect(page).toHaveURL(/\/widgets\/drill/);
});

/** The cards and parts of the Story still waiting on their query. */
function placeholders(page: Page) {
  return page.locator('[aria-busy="true"]');
}

test('the Story streams its parts in: once loaded, every Widget has its card and no placeholder is left', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Recent activity', level: 2 })).toBeVisible();
  for (const name of ['Income vs. expense', 'Net cash flow', 'Spending by Category']) {
    await expect(widgetCard(page, name)).toBeVisible();
  }
  await expect(placeholders(page)).toHaveCount(0);

  // Edit mode and back: the route skeletons give way to the pages.
  await page.getByRole('link', { name: 'Edit Dashboard' }).click();
  await expect(page.getByText('Editing', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: 'Edit Dashboard' })).toBeVisible();
  await expect(placeholders(page)).toHaveCount(0);
});

test('a Widget whose query reports a problem says so in its own card; the others still draw', async ({
  page,
}) => {
  const suffix = Date.now();
  const dashboardId = await withServices(async (ctx) => {
    const dashboard = await createDashboardRecord(ctx, { name: `Streams ${suffix}` });
    await addWidget(ctx, dashboard.id, {
      name: 'Still fine',
      visualisation: 'number',
      query: { dateRange: { kind: 'last', count: 3, unit: 'month' }, rows: null, columns: null },
    });
    const broken = await addWidget(ctx, dashboard.id, {
      name: 'Gone wrong',
      visualisation: 'line',
      query: { dateRange: { kind: 'last', count: 3, unit: 'month' }, rows: null, columns: 'month' },
    });
    // A stored query that no longer passes validation: its run reports the problem.
    await ctx.db.query(
      `UPDATE widget SET query = jsonb_set(query, '{dateRange}', $2::jsonb) WHERE id = $1`,
      [broken.id, JSON.stringify({ kind: 'fixed', from: '2026-02-01', to: '2026-01-01' })],
    );
    return dashboard.id;
  });

  await page.goto(`/dashboards/${dashboardId}`);

  await expect(widgetCard(page, 'Gone wrong')).toContainText('From must not be after To');
  await expect(chapterTitles(page)).toHaveText(['Still fine', 'Gone wrong']);
  await expect(placeholders(page)).toHaveCount(0);
});
