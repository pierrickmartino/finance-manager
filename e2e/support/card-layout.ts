/**
 * Helpers for how a Widget's Card lays out from its own width (spec #93): finding a Card in
 * each of its states, measuring its ring and lead, seeding ring Cards at given board sizes, and
 * holding the board on its placeholders (or failing its queries) with a lock on the Split lines.
 */
import type { Locator, Page } from '@playwright/test';
import { createDb } from '../../src/server/db/client';
import { createAccount } from '../../src/server/services/accounts';
import { createBank } from '../../src/server/services/banks';
import { addWidget, createDashboard } from '../../src/server/services/dashboards';
import { addDays, swissToday } from '../../src/server/services/fx/dates';
import type { WidgetQueryInput } from '../../src/server/services/reporting/query';
import { createManualTransaction } from '../../src/server/services/transactions/manual';
import { databaseUrl } from '../../test/support/postgres';
import { withServices } from './services';

/** A Card's place and size on the board, in grid cells. */
export interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a ring's list sits: below the ring, or beside it. */
export type Placement = 'below' | 'beside';

/** At 1280 a 4-of-12 Card is about 355px inside (under `@md`), an 8-of-12 one about 773px. */
export const NARROW_LAYOUT: Layout = { x: 0, y: 0, w: 4, h: 9 };
export const WIDE_LAYOUT: Layout = { x: 4, y: 0, w: 8, h: 9 };

/** A loaded Widget's Card, by its name (not the overview tile that can share it). */
export function card(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name, exact: true })
    .and(page.locator('[aria-labelledby^="card-"]'));
}

/** A Widget's Card still waiting on its query. */
export function cardPlaceholder(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true }).and(page.locator('[aria-busy="true"]'));
}

/** A Widget's Card whose query failed unexpectedly: its error boundary. */
export function failedCard(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true }).filter({ has: page.getByRole('alert') });
}

/** Where a Card's (or its placeholder's) ring list sits, from their measured boxes. */
export async function ringListPlacement(of: Locator): Promise<Placement> {
  const ring = await of.getByTestId('ring').boundingBox();
  const list = await of.getByTestId('ring-list').boundingBox();
  if (!ring || !list) throw new Error('No ring or list');
  if (list.y >= ring.y + ring.height) return 'below';
  if (list.x >= ring.x + ring.width) return 'beside';
  throw new Error('The list overlaps the ring');
}

/** The computed font size of a Card's lead figure. */
export async function leadFontSize(of: Locator): Promise<string> {
  return of.getByTestId('card-lead').evaluate((el) => getComputedStyle(el).fontSize);
}

/** The height of the line a Card's lead (or its placeholder's) takes, margins included. */
export async function leadLine(of: Locator): Promise<number> {
  return of.getByTestId('card-lead').evaluate((el) => {
    const style = getComputedStyle(el);
    const margins = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    return el.getBoundingClientRect().height + margins;
  });
}

/** The container type a Card sets up for what's inside it. */
export async function containerType(of: Locator): Promise<string> {
  return of.evaluate((el) => getComputedStyle(el).containerType);
}

/** Two Accounts with a spend each, three days ago: enough for a ring of two parts. */
export async function seedRingQuery(suffix: number): Promise<WidgetQueryInput> {
  return withServices(async (ctx) => {
    const bank = await createBank(ctx, { name: `Ring bank ${suffix}` });
    const today = swissToday();
    const spends = [
      { name: `Rent ${suffix}`, amountMinor: -75_000 },
      { name: `Food ${suffix}`, amountMinor: -25_000 },
    ];
    const accounts = await Promise.all(
      spends.map(async ({ name, amountMinor }) => {
        const account = await createAccount(ctx, {
          bankId: bank.id,
          name,
          currency: 'CHF',
          iban: null,
          kind: 'current',
          importFormat: null,
          openingBalanceMinor: 0,
        });
        await createManualTransaction(ctx, {
          accountId: account.id,
          bookingDate: addDays(today, -3),
          amountMinor,
          description: 'Ring spend',
        });
        return account;
      }),
    );
    return {
      dateRange: { kind: 'fixed', from: addDays(today, -10), to: today },
      rows: 'account',
      columns: null,
      filters: { accountIds: accounts.map((account) => account.id) },
    };
  });
}

/** Ring Cards by name and layout, by default the narrow and wide pair. */
export type RingLayouts = Readonly<Record<string, Layout>>;

const TWO_RINGS: RingLayouts = { 'Narrow ring': NARROW_LAYOUT, 'Wide ring': WIDE_LAYOUT };

/** A new Dashboard of ring Cards over seeded data, at the given layouts; returns its id. */
export async function seedRingDashboard(
  suffix: number,
  rings: RingLayouts = TWO_RINGS,
): Promise<string> {
  const query = await seedRingQuery(suffix);
  return withServices(async (ctx) => {
    const dashboard = await createDashboard(ctx, { name: `Rings ${suffix}` });
    for (const [name, layout] of Object.entries(rings)) {
      // One at a time: each is placed on the board as it stands.
      await addWidget(ctx, dashboard.id, { name, visualisation: 'donut', query, layout });
    }
    return dashboard.id;
  });
}

/** The Card queries waiting on the lock: the report's one statement names `report_base`. */
const WAITING_CARD_QUERIES = `SELECT pg_cancel_backend(pid) FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid()
    AND wait_event_type = 'Lock' AND query LIKE '%report_base%'`;

/**
 * A lock on the Split lines while `run` runs: every Card's query (which reads them) waits on it,
 * while the page around it (which does not) still draws.
 */
export async function whileCardQueriesWait<T>(
  run: (cancelWaiting: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const db = createDb(databaseUrl(process.env.E2E_DATABASE_NAME!));
  const lock = await db.connect();
  try {
    await lock.query('BEGIN');
    await lock.query('LOCK TABLE split_line IN ACCESS EXCLUSIVE MODE');
    // Cancelling a waiting Card query makes it fail unexpectedly, as a lost database would.
    return await run(async () => {
      await db.query(WAITING_CARD_QUERIES);
    });
  } finally {
    await lock.query('ROLLBACK');
    lock.release();
    await db.end();
  }
}
