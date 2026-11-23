import { expect, test, type Locator, type Page } from '@playwright/test';
import { queryToParams } from '../src/lib/reporting/widget-params';
import { createAccount } from '../src/server/services/accounts';
import { createBank } from '../src/server/services/banks';
import { addWidget, createDashboard } from '../src/server/services/dashboards';
import { addDays, swissToday } from '../src/server/services/fx/dates';
import { createManualTransaction } from '../src/server/services/transactions/manual';
import {
  card,
  cardPlaceholder,
  containerType,
  failedCard,
  leadFontSize,
  leadLine,
  ringListPlacement,
  seedRingDashboard,
  seedRingQuery,
  whileCardQueriesWait,
  type Layout,
  type Placement,
} from './support/card-layout';
import { boardIsStill } from './support/dashboards';
import { withServices } from './support/services';

/**
 * A Widget's Card lays out from its own width, not the window's (spec #93, #252–#255): the
 * ring's list, the lead's size, the facts, ticks and bars, in every place a Card is drawn, and
 * its placeholder and error boundary alike. Every check is on measured boxes or computed styles.
 */

const RINGS = ['Narrow ring', 'Wide ring'] as const;

/** Opens a Dashboard at 1280px wide, where the board has its 12 columns. */
async function openWide(page: Page, dashboardId: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/dashboards/${dashboardId}`);
}

/** The narrow ring reads below with the smaller lead, the wide one beside with the full lead. */
async function expectNarrowAndWideRings(page: Page): Promise<void> {
  expect(await ringListPlacement(card(page, 'Narrow ring'))).toBe('below');
  expect(await ringListPlacement(card(page, 'Wide ring'))).toBe('beside');
  expect(await leadFontSize(card(page, 'Narrow ring'))).toBe('20px');
  expect(await leadFontSize(card(page, 'Wide ring'))).toBe('30px');
}

test("a ring Card lays out from its own width, not the window's: list below on a narrow Card, beside on a wide one", async ({
  page,
}) => {
  await openWide(page, await seedRingDashboard(Date.now()));
  for (const name of RINGS) {
    await expect(card(page, name).getByTestId('ring-list')).toBeVisible();
    // The Card is the size container its inside follows.
    expect(await containerType(card(page, name))).toBe('inline-size');
  }
  await expectNarrowAndWideRings(page);

  // Edit mode draws the same Cards at the same widths, so the same way.
  await page.getByRole('link', { name: 'Edit Dashboard' }).click();
  await expect(page.getByText('Editing', { exact: true })).toBeVisible();
  await boardIsStill(page);
  await expectNarrowAndWideRings(page);
});

test('a half-width Card (6 of 12 columns at 1280) is past the threshold: full lead, list beside', async ({
  page,
}) => {
  // About 564px inside, above `@md` (448px).
  const half: Layout = { x: 0, y: 0, w: 6, h: 9 };
  await openWide(page, await seedRingDashboard(Date.now(), { 'Half ring': half }));
  await expect(card(page, 'Half ring').getByTestId('ring-list')).toBeVisible();

  expect(await leadFontSize(card(page, 'Half ring'))).toBe('30px');
  expect(await ringListPlacement(card(page, 'Half ring'))).toBe('beside');
});

test("the Widget editor's Card preview follows the same ring rule as the board, by the preview's width", async ({
  page,
}) => {
  const suffix = Date.now();
  const query = await seedRingQuery(suffix);
  const widgetIds = await withServices(async (ctx) => {
    const dashboard = await createDashboard(ctx, { name: `Preview rings ${suffix}` });
    const narrow = await addWidget(ctx, dashboard.id, {
      name: 'Narrow preview',
      visualisation: 'donut',
      query,
      layout: { x: 0, y: 0, w: 4, h: 9 },
    });
    const full = await addWidget(ctx, dashboard.id, {
      name: 'Full preview',
      visualisation: 'donut',
      query,
      layout: { x: 0, y: 9, w: 12, h: 9 },
    });
    return { narrow: narrow.id, full: full.id };
  });
  const editorHref = (id: string) => {
    const params = queryToParams(query);
    params.set('widget', id);
    params.set('vis', 'donut');
    return `/widgets/new?${params}`;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [id, name, placement] of [
    [widgetIds.narrow, 'Narrow preview', 'below'],
    [widgetIds.full, 'Full preview', 'beside'],
  ] as const) {
    await page.goto(editorHref(id));
    const preview = card(page, name);
    await expect(preview.getByTestId('ring-list')).toBeVisible();
    expect(await containerType(preview)).toBe('inline-size');
    expect(await ringListPlacement(preview)).toBe(placement);
  }
});

/** How many columns a Card's facts sit in: the facts on the first one's line. */
async function factColumns(of: Locator): Promise<number> {
  const tops = await of
    .locator('dl > div')
    .evaluateAll((facts) => facts.map((fact) => fact.getBoundingClientRect().top));
  if (tops.length === 0) throw new Error('No facts');
  return tops.filter((top) => Math.abs(top - tops[0]!) < 1).length;
}

/** The space between a bars Card's first two bars, in pixels. */
async function barGap(of: Locator): Promise<number> {
  const bars = of.getByRole('link', { name: /: CHF/ });
  const first = await bars.nth(0).boundingBox();
  const second = await bars.nth(1).boundingBox();
  if (!first || !second) throw new Error('Fewer than two bars');
  return second.x - (first.x + first.width);
}

/** A stacked bar Widget to seed: by Account it is a ranking (ticks), alone it is bars. */
interface BarsSpec {
  name: string;
  isRanking: boolean;
  layout: Layout;
}

/**
 * At 1280 a 3-of-12 Card is about 251px inside, 4-of-12 about 355px and 8-of-12 about 773px.
 * Three series make a stacked bar a ranking, with three facts.
 */
const DENSITY_CARDS: readonly BarsSpec[] = [
  { name: 'Narrow ranking', isRanking: true, layout: { x: 0, y: 0, w: 3, h: 10 } },
  { name: 'Medium ranking', isRanking: true, layout: { x: 3, y: 0, w: 4, h: 10 } },
  { name: 'Wide ranking', isRanking: true, layout: { x: 0, y: 10, w: 8, h: 10 } },
  { name: 'Narrow bars', isRanking: false, layout: { x: 0, y: 20, w: 3, h: 8 } },
  { name: 'Wide bars', isRanking: false, layout: { x: 3, y: 20, w: 8, h: 8 } },
];

/** Three Accounts, each with a spend in each of the last three months, under DENSITY_CARDS. */
async function seedDensityDashboard(accountNames: readonly string[], suffix: number) {
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Density bank ${suffix}` });
    const today = swissToday();
    const accounts = await Promise.all(
      accountNames.map((name) =>
        createAccount(ctx, {
          bankId: bank.id,
          name,
          currency: 'CHF',
          iban: null,
          kind: 'current',
          importFormat: null,
          openingBalanceMinor: 0,
        }),
      ),
    );
    await Promise.all(
      accounts.flatMap((account, index) =>
        [70, 40, 10].map((daysAgo) =>
          createManualTransaction(ctx, {
            accountId: account.id,
            bookingDate: addDays(today, -daysAgo),
            amountMinor: -(index + 1) * 10_000 - daysAgo * 100,
            description: 'Density spend',
          }),
        ),
      ),
    );
    const dateRange = { kind: 'fixed' as const, from: addDays(today, -80), to: today };
    const filters = { accountIds: accounts.map((account) => account.id) };
    const dashboard = await createDashboard(ctx, { name: `Density ${suffix}` });
    for (const { name, isRanking, layout } of DENSITY_CARDS) {
      const columns = isRanking ? ('account' as const) : null;
      const query = { dateRange, rows: 'month' as const, columns, filters };
      await addWidget(ctx, dashboard.id, { name, visualisation: 'stacked_bar', query, layout });
    }
    return dashboard.id;
  });
}

test("a Card's facts, ticks and bars follow its own width; a narrow Card still shows every item", async ({
  page,
}) => {
  const suffix = Date.now();
  const accounts = [`Rent ${suffix}`, `Food ${suffix}`, `Fun ${suffix}`];
  await openWide(page, await seedDensityDashboard(accounts, suffix));
  for (const name of ['Narrow ranking', 'Medium ranking', 'Wide ranking']) {
    await expect(card(page, name).locator('dl > div')).toHaveCount(3);
  }

  // Facts: one column below @2xs, two from @2xs, three from @2xl.
  expect(await factColumns(card(page, 'Narrow ranking'))).toBe(1);
  expect(await factColumns(card(page, 'Medium ranking'))).toBe(2);
  expect(await factColumns(card(page, 'Wide ranking'))).toBe(3);

  // Ticks: the meter is hidden below @2xs; every item's name and percent still show.
  for (const [name, isMeterShown] of [
    ['Narrow ranking', false],
    ['Medium ranking', true],
  ] as const) {
    const items = card(page, name).getByRole('listitem');
    await expect(items).toHaveCount(3);
    for (const account of accounts) {
      const item = items.filter({ hasText: account });
      await expect(item.getByText(/^\d+%$/)).toBeVisible();
      await expect(item.locator('[aria-hidden]')).toBeVisible({ visible: isMeterShown });
    }
  }

  // Bars: closer together below @xs, every period still shown.
  const narrowBars = card(page, 'Narrow bars').getByRole('link', { name: /: CHF/ });
  const wideBars = card(page, 'Wide bars').getByRole('link', { name: /: CHF/ });
  await expect(wideBars).not.toHaveCount(0);
  await expect(narrowBars).toHaveCount(await wideBars.count());
  for (const bar of await narrowBars.all()) await expect(bar).toBeVisible();
  expect(await barGap(card(page, 'Narrow bars'))).toBeLessThan(
    await barGap(card(page, 'Wide bars')),
  );
});

/** What a ring Card's placeholder looked like: its list's placement and its lead's line. */
interface WaitingLayout {
  placement: Placement;
  leadLine: number;
}

async function waitingLayout(page: Page, name: string): Promise<WaitingLayout> {
  const waiting = cardPlaceholder(page, name);
  await expect(waiting).toBeVisible();
  expect(await containerType(waiting)).toBe('inline-size');
  return { placement: await ringListPlacement(waiting), leadLine: await leadLine(waiting) };
}

test("a ring Card's placeholder is laid out like the loaded Card at its width: list below when narrow, beside when wide", async ({
  page,
}) => {
  const dashboardId = await seedRingDashboard(Date.now());
  await page.setViewportSize({ width: 1280, height: 900 });

  // Every Card's query waits on the lock, so the board stays on its placeholders.
  const [narrow, wide] = await whileCardQueriesWait(async () => {
    await page.goto(`/dashboards/${dashboardId}`, { waitUntil: 'commit' });
    return [await waitingLayout(page, 'Narrow ring'), await waitingLayout(page, 'Wide ring')];
  });

  // The placeholder's list sits where the loaded Card's will; its lead skeleton follows the
  // lead's threshold, a size down on the narrow Card.
  expect(narrow.placement).toBe('below');
  expect(wide.placement).toBe('beside');
  expect(narrow.leadLine).toBeLessThan(wide.leadLine);

  // Once the data arrives, each Card has its placeholder's layout and its lead the same line.
  for (const [name, waited] of [
    ['Narrow ring', narrow],
    ['Wide ring', wide],
  ] as const) {
    await expect(card(page, name).getByTestId('ring-list')).toBeVisible();
    expect(await ringListPlacement(card(page, name))).toBe(waited.placement);
    expect(await leadLine(card(page, name))).toBeCloseTo(waited.leadLine, 0);
  }
});

/** A Card's frame as laid out: its box on the page, its container and its spacing. */
async function frameOf(of: Locator) {
  const box = await of.boundingBox();
  if (!box) throw new Error('No Card');
  const style = await of.evaluate((el) => {
    const computed = getComputedStyle(el);
    return { containerType: computed.containerType, rowGap: computed.rowGap };
  });
  return { x: Math.round(box.x), width: Math.round(box.width), ...style };
}

test("a Card whose query fails is laid out by the Card's width, as the loaded Card is", async ({
  page,
}) => {
  const dashboardId = await seedRingDashboard(Date.now());
  await page.setViewportSize({ width: 1280, height: 900 });

  // Each Card's query is cancelled while it waits: it fails unexpectedly, into its error boundary.
  const failed = await whileCardQueriesWait(async (cancelWaiting) => {
    await page.goto(`/dashboards/${dashboardId}`, { waitUntil: 'commit' });
    await expect(async () => {
      await cancelWaiting();
      for (const name of RINGS) await expect(failedCard(page, name)).toBeVisible({ timeout: 500 });
    }).toPass();
    return Promise.all(RINGS.map((name) => frameOf(failedCard(page, name))));
  });

  await page.reload();
  for (const [index, name] of RINGS.entries()) {
    await expect(card(page, name).getByTestId('ring-list')).toBeVisible();
    expect(failed[index]).toEqual(await frameOf(card(page, name)));
    expect(failed[index]!.containerType).toBe('inline-size');
  }
});

test("Analytics' Card sections wait and fail in Card frames; its other sections stay plain tiles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const section = (name: string) => page.getByRole('region', { name, exact: true });

  await whileCardQueriesWait(async (cancelWaiting) => {
    await page.goto('/analytics', { waitUntil: 'commit' });
    const waiting = section('Net cash flow').and(page.locator('[aria-busy="true"]'));
    await expect(waiting).toBeVisible();
    expect(await containerType(waiting)).toBe('inline-size');
    expect(await containerType(section('Key figures'))).toBe('normal');

    await expect(async () => {
      await cancelWaiting();
      await expect(failedCard(page, 'Net cash flow')).toBeVisible({ timeout: 500 });
    }).toPass();
    expect(await containerType(failedCard(page, 'Net cash flow'))).toBe('inline-size');
  });
});
