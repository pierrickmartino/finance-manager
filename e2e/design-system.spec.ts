import { expect, test, type Locator, type Page } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { SIGNED_OUT } from './support/auth';
import { focusOutline, pageColours, textContrastFailures } from './support/contrast';
import { openHomeDashboard } from './support/dashboards';
import { withServices } from './support/services';

/*
 * The design system's colours (spec #239, ADR-0017), checked on the app's real pages as the
 * browser computes them: every page is dark whatever the system theme, its text passes AA on
 * what is behind it, and the focus outline passes on the page, a card and the Bulk edit dock.
 * Token values are never named here, so a retune is checked, not restated.
 */

/** An Account with two manual Transactions, so the list has rows to tick. Names are unique. */
async function seedTransactions(): Promise<string> {
  const suffix = Date.now();
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Design bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Design account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2024-01-01',
    });
    for (const [day, amountMinor] of [
      ['2025-01-02', -12_50],
      ['2025-01-03', 2_000_00],
    ] as const) {
      await createManualTransaction(ctx, {
        accountId: account.id,
        bookingDate: day,
        amountMinor,
        description: `Design item ${day}`,
      });
    }
    return account.id;
  });
}

/** The 10th of the month `back` months before this one, from the Swiss date. */
function inMonthBefore(back: number): string {
  const [year, month] = swissToday().split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-10`;
}

/**
 * Four months of classified income and spending, so Analytics draws every Card with words on
 * its marks: the heatmap's shades, the insight card and Recent transactions' spotlight.
 */
async function seedFlow(): Promise<void> {
  const suffix = Date.now();
  await withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Flow bank ${suffix}` });
    const account = await createAccount(ctx, {
      bankId: bank.id,
      kind: 'current',
      importFormat: null,
      name: `Flow account ${suffix}`,
      currency: 'CHF',
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });
    const income = await createCategoryGroup(ctx, { name: `In ${suffix}`, type: 'income' });
    const living = await createCategoryGroup(ctx, { name: `Out ${suffix}`, type: 'expense' });
    const salary = await createCategory(ctx, { groupId: income.id, name: 'Salary' });
    const rent = await createCategory(ctx, { groupId: living.id, name: 'Rent' });
    const food = await createCategory(ctx, { groupId: living.id, name: 'Food' });
    for (const back of [0, 1, 2, 3]) {
      for (const [amountMinor, category] of [
        [5000_00, salary],
        [-(1000_00 + back * 150_00), rent],
        [-(120_00 + back * 90_00), food],
      ] as const) {
        const transaction = await createManualTransaction(ctx, {
          accountId: account.id,
          bookingDate: inMonthBefore(back),
          amountMinor,
          description: `Flow ${back} ${category.name}`,
        });
        await editClassification(ctx, transaction.id, { categoryId: category.id });
      }
    }
  });
}

/** Analytics with every Card drawn, the ones with words on their marks among them. */
async function openAnalytics(page: Page): Promise<void> {
  await page.goto('/analytics');
  await expect(page.getByRole('table', { name: 'Heatmap' }).first()).toBeVisible();
  await expect(page.locator('section[aria-labelledby="overview-insight"]')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="overview-recent"] > a')).toBeVisible();
}

/** The Transactions list of a seeded Account, with a row ticked so the Bulk edit dock is open. */
async function openListWithDock(page: Page): Promise<Locator> {
  const accountId = await seedTransactions();
  await page.goto(`/transactions?accountId=${accountId}`);
  const rows = page.getByRole('table', { name: 'Transactions' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await page.waitForLoadState('networkidle');
  await rows.first().getByRole('checkbox').check();
  const dock = page.getByRole('region', { name: 'Bulk edit' });
  await expect(dock).toContainText('1 selected');
  return dock;
}

const PAGES: { name: string; open: (page: Page) => Promise<unknown> }[] = [
  { name: 'Analytics', open: openAnalytics },
  { name: 'a Dashboard', open: openHomeDashboard },
  { name: 'the Transactions list with the Bulk edit dock open', open: openListWithDock },
  { name: 'Settings', open: (page) => page.goto('/settings') },
];

/** Waits until nothing is still loading or animating in, so colours are the settled ones. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

test.beforeAll(seedFlow);

for (const { name, open } of PAGES) {
  test(`${name} stays dark with a light system theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);

    const colours = await pageColours(page);
    expect(colours.colorScheme).toBe('dark');
    expect(colours.background).toBeLessThan(0.02);
    expect(colours.text).toBeGreaterThan(0.7);
  });

  test(`the text on ${name} passes AA on its background`, async ({ page }) => {
    await open(page);
    await settle(page);

    const { failures, measured } = await textContrastFailures(page);

    expect(measured).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });
}

test('the sign-in page is dark too', async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('/login');

  const colours = await pageColours(page);
  expect(colours.background).toBeLessThan(0.02);
  expect(colours.text).toBeGreaterThan(0.7);
  expect((await textContrastFailures(page)).failures).toEqual([]);
  await context.close();
});

/** Focuses `target` from the keyboard (Tab first, so the browser shows :focus-visible). */
async function keyboardFocus(page: Page, target: Locator): Promise<void> {
  await page.keyboard.press('Tab');
  await target.focus();
}

test('the focus outline passes AA on the page, on a card and on the Bulk edit dock', async ({
  page,
}) => {
  const dock = await openListWithDock(page);
  const targets = {
    'the page': page.getByRole('link', { name: 'Settings' }),
    'a card': page.getByRole('table', { name: 'Transactions' }).getByRole('checkbox').last(),
    'the dock': dock.getByRole('button', { name: 'Category' }),
  };

  const outlines = new Set<string>();
  for (const [where, target] of Object.entries(targets)) {
    await keyboardFocus(page, target);
    const { isFocusVisible, outline, failure } = await focusOutline(target);
    expect(isFocusVisible, `focus shows on ${where}`).toBe(true);
    expect(failure, `outline on ${where}`).toBeNull();
    outlines.add(outline);
  }
  // One focus style everywhere: the accent.
  expect(outlines.size).toBe(1);
});
