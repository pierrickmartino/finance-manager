import { expect, test, type Locator, type Page } from '@playwright/test';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { createCategory, createCategoryGroup } from '../src/server/services/categories';
import { swissToday } from '../src/server/services/fx/dates';
import { editClassification } from '../src/server/services/transactions';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import { SIGNED_OUT } from './support/auth';
import {
  focusOutline,
  pageColours,
  textColour,
  textContrastFailures,
  tokenColour,
} from './support/contrast';
import { openHomeDashboard } from './support/dashboards';
import {
  applyNoBackdropFilterFallback,
  emulateReducedTransparency,
  fillOf,
  glassCount,
  glassRegions,
  pageGlow,
} from './support/glass';
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

/** The Dashboard's tiles: its overview row (Net worth, the insight, Recent activity). */
const OVERVIEW_TILES = ['overview-headline', 'overview-insight', 'overview-recent'].map(
  (id) => `section[aria-labelledby="${id}"]`,
);

/** Analytics with every Card drawn, the ones with words on their marks among them. */
async function openAnalytics(page: Page): Promise<void> {
  await page.goto('/analytics');
  await expect(page.getByRole('table', { name: 'Heatmap' }).first()).toBeVisible();
  await expect(page.locator(OVERVIEW_TILES[1]!)).toBeVisible();
  await expect(page.locator(`${OVERVIEW_TILES[2]!} > a`)).toBeVisible();
}

/** The home Dashboard with its overview row and its Widgets' cards drawn. */
async function openDashboard(page: Page): Promise<void> {
  await openHomeDashboard(page);
  for (const tile of OVERVIEW_TILES) await expect(page.locator(tile)).toBeVisible();
  await expect(widgetCards(page).first()).toBeVisible();
}

/** Every Widget's card on a Dashboard: a region labelled by its `card-…` heading. */
const widgetCards = (page: Page) => page.locator('section[aria-labelledby^="card-"]');

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

/** Analytics' Net worth Key figure: a tile. */
function keyFigureTile(page: Page): Locator {
  return page
    .getByRole('region', { name: 'Key figures' })
    .getByRole('region', { name: 'Net worth', exact: true });
}

/**
 * One page the design system is checked on. Containers by kind: on a page of tiles every glass
 * region is a tile and glows (bar the cards named in `cards`); other containers are glass
 * without the glow; inputs and table rows are solid.
 */
interface DesignPage {
  name: string;
  open: (page: Page) => Promise<unknown>;
  /** A page of the Dashboard's and Analytics' tiles. */
  tiles?: {
    /** Tiles that must be among them, and are checked opaque under the fallback. */
    expected: (page: Page) => Locator[];
    /** How many tiles there are at least. */
    atLeast: (page: Page) => Promise<number>;
    /** Glass regions on the page that are cards, not tiles, each with why. */
    cards?: Record<string, string>;
  };
  /** Other containers, each found by something inside it: glass without the glow. */
  containers?: (page: Page) => Locator[];
  /** Inputs and table rows: opaque, with a fill of their own. */
  solid?: (page: Page) => Locator[];
  /** Text measured on a gradient's fill (the Net worth tile's), so it is known to be checked. */
  textOverGradient?: string;
}

const PAGES: DesignPage[] = [
  {
    name: 'Analytics',
    open: openAnalytics,
    tiles: {
      expected: (page) => [keyFigureTile(page), page.locator(OVERVIEW_TILES[1]!)],
      // Four Key figures, the insight and Recent transactions, then a section per Card.
      atLeast: async () => 6,
    },
  },
  {
    name: 'a Dashboard',
    open: openDashboard,
    tiles: {
      expected: (page) => [...OVERVIEW_TILES.map((tile) => page.locator(tile)), widgetCards(page)],
      atLeast: async (page) => OVERVIEW_TILES.length + (await widgetCards(page).count()),
    },
    textOverGradient: 'Your net worth today',
  },
  {
    name: 'the Transactions list with the Bulk edit dock open',
    open: openListWithDock,
    containers: (page) => [
      page.getByRole('table', { name: 'Transactions' }),
      page.getByRole('form', { name: 'Search Transactions' }),
      page.getByRole('button', { name: 'Clear selection' }),
    ],
    solid: (page) => [
      page.getByRole('table', { name: 'Transactions' }).locator('tbody tr').first(),
      page.getByRole('textbox', { name: 'Search' }),
    ],
  },
  {
    name: 'Settings',
    open: (page) => page.goto('/settings'),
    containers: (page) => [page.getByText('Number format', { exact: true })],
  },
];

/** Relative luminance under which the page reads as deep navy, and over which text reads light. */
const DEEP = 0.02;
const LIGHT = 0.7;
/** Enough text measured that a page which failed to draw would not pass unnoticed. */
const MIN_TEXTS_MEASURED = 10;
/** A glass container's fill: see-through, yet enough of it that the text on it reads. */
const MIN_GLASS_ALPHA = 0.3;

/** Waits until nothing is still loading or animating in, so colours are the settled ones. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

test.beforeAll(seedFlow);

for (const { name, open, tiles, containers, solid, textOverGradient } of PAGES) {
  test(`${name} stays dark with a light system theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);

    const colours = await pageColours(page);
    expect(colours.colorScheme).toBe('dark');
    expect(colours.background).toBeLessThan(DEEP);
    expect(colours.text).toBeGreaterThan(LIGHT);
  });

  test(`the text on ${name} passes AA on its background`, async ({ page }) => {
    await open(page);
    await settle(page);

    const { failures, measured, overImage } = await textContrastFailures(page);

    expect(measured).toBeGreaterThan(MIN_TEXTS_MEASURED);
    expect(failures).toEqual([]);
    if (textOverGradient) expect(overImage.join('\n')).toContain(textOverGradient);
  });

  test(`containers on ${name} are glass over the page glow, inputs and rows solid`, async ({
    page,
  }) => {
    await open(page);
    await settle(page);

    if (tiles) {
      const regions = await glassRegions(page);
      const named = regions.map((region) => region.name);
      for (const tile of tiles.expected(page)) {
        for (const each of await tile.all()) {
          const fill = await fillOf(each);
          expect(fill.alpha, 'a tile is see-through').toBeLessThan(1);
          expect(fill.alpha, 'a tile still has a fill').toBeGreaterThan(MIN_GLASS_ALPHA);
          expect(fill.isBlurred, 'a tile blurs the page').toBe(true);
          expect(fill.hasInnerGlow, 'a tile glows').toBe(true);
        }
      }
      const glowing = regions.filter((region) => !(region.name in (tiles.cards ?? {})));
      expect(glowing.length, named.join(', ')).toBeGreaterThanOrEqual(await tiles.atLeast(page));
      for (const region of glowing) expect(region.hasInnerGlow, `${region.name} glows`).toBe(true);
      // A card beside the tiles (drawn only when it has something to say) stays without the glow.
      for (const card of regions.filter((region) => region.name in (tiles.cards ?? {}))) {
        expect(card.hasInnerGlow, card.name).toBe(false);
      }
    }
    for (const container of containers?.(page) ?? []) {
      const fill = await fillOf(container);
      expect(fill.alpha, 'a container is see-through').toBeLessThan(1);
      expect(fill.alpha, 'a container still has a fill').toBeGreaterThan(MIN_GLASS_ALPHA);
      expect(fill.isBlurred, 'a container blurs the page').toBe(true);
      expect(fill.hasInnerGlow, 'only tiles glow').toBe(false);
    }
    for (const part of solid?.(page) ?? []) {
      const fill = await fillOf(part, { isOwn: true });
      expect(fill.alpha, 'inputs and rows are opaque').toBe(1);
      expect(fill.isBlurred).toBe(false);
    }
    // Drawn on the page, fixed, so it stays put when the page scrolls.
    expect(await pageGlow(page)).toEqual({ isDrawn: true, isFixed: true });
  });

  test(`under reduced transparency, containers on ${name} are opaque with no page glow`, async ({
    page,
  }) => {
    await emulateReducedTransparency(page);
    await open(page);
    await settle(page);

    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches),
    ).toBe(true);
    for (const container of [...(tiles?.expected(page) ?? []), ...(containers?.(page) ?? [])]) {
      for (const each of await container.all()) {
        expect((await fillOf(each)).alpha, 'a container is opaque').toBe(1);
      }
    }
    expect(await glassCount(page), 'nothing blurs the page').toBe(0);
    expect((await pageGlow(page)).isDrawn).toBe(false);
  });

  test(`the text on ${name} passes AA on the opaque fallback surface`, async ({ page }) => {
    await emulateReducedTransparency(page);
    await open(page);
    await settle(page);

    const { failures, measured, overImage } = await textContrastFailures(page);

    expect(measured).toBeGreaterThan(MIN_TEXTS_MEASURED);
    expect(failures).toEqual([]);
    if (textOverGradient) expect(overImage.join('\n')).toContain(textOverGradient);
  });
}

test('the sign-in page is dark too', async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('/login');

  const colours = await pageColours(page);
  expect(colours.colorScheme).toBe('dark');
  expect(colours.background).toBeLessThan(DEEP);
  expect(colours.text).toBeGreaterThan(LIGHT);
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

test("the top bar marks the current page's pill in the accent, as the drawer marks its link", async ({
  page,
}) => {
  await page.goto('/settings');
  const pill = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Analytics' });
  await page.goto('/analytics');
  await expect(pill).toHaveAttribute('aria-current', 'page');

  const accent = await tokenColour(page, 'accent-ink');
  expect(await textColour(pill)).toBe(accent);
  expect((await fillOf(pill, { isOwn: true })).alpha, 'a solid tint behind it').toBe(1);

  await page.setViewportSize(NARROW);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const current = page.getByRole('dialog', { name: 'Menu' }).locator('[aria-current="page"]');
  expect(await textColour(current)).toBe(accent);
});

/** A phone's viewport, where the bar's pills give way to the drawer. */
const NARROW = { width: 390, height: 844 };

/** Opens the drawer on a phone and reads its fill. */
async function openDrawer(page: Page): Promise<Locator> {
  await page.setViewportSize(NARROW);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  return drawer;
}

test('the mobile drawer is glass', async ({ page }) => {
  const fill = await fillOf(await openDrawer(page), { isOwn: true });

  expect(fill.alpha, 'see-through').toBeLessThan(1);
  expect(fill.alpha, 'still has a fill').toBeGreaterThan(MIN_GLASS_ALPHA);
  expect(fill.isBlurred, 'blurs the page').toBe(true);
  expect((await textContrastFailures(page)).failures).toEqual([]);
});

test('under reduced transparency, the mobile drawer is opaque and nothing blurs', async ({
  page,
}) => {
  await emulateReducedTransparency(page);
  const fill = await fillOf(await openDrawer(page), { isOwn: true });

  expect(fill.alpha, 'opaque').toBe(1);
  expect(await glassCount(page), 'nothing blurs the page').toBe(0);
  expect((await textContrastFailures(page)).failures).toEqual([]);
});

test('without backdrop-filter support, containers are opaque with no page glow', async ({
  page,
}) => {
  await page.goto('/analytics');
  await settle(page);

  expect(
    await applyNoBackdropFilterFallback(page),
    'the stylesheet has a fallback',
  ).toBeGreaterThan(0);

  const tile = keyFigureTile(page);
  expect((await fillOf(tile)).alpha).toBe(1);
  expect(await glassCount(page)).toBe(0);
  expect((await pageGlow(page)).isDrawn).toBe(false);
});
