import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, databaseUrl, dropDatabase } from '@test/support/postgres';
import { migrate } from './migrate';

/** The migration that moves every Dashboard from Story order onto the grid (ADR-0010). */
const GRID_MIGRATION = '20261112072753_dashboard_grid_layout';

interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}

describe('the Dashboard grid migration', () => {
  const name = `${inject('testDatabase').prefix}_grid_migration`;
  const url = databaseUrl(name);
  let db: pg.Client;

  beforeAll(async () => {
    await createDatabase(name);
    await migrate(url, { quiet: true });
    // Roll back to just before the grid migration (later ones first, if any).
    for (;;) {
      const [rolledBack] = await migrate(url, { direction: 'down', quiet: true });
      if (!rolledBack || rolledBack === GRID_MIGRATION) break;
    }
    db = new pg.Client({ connectionString: url });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
    await dropDatabase(name);
  });

  async function addDashboard(): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO dashboard (name) VALUES ('D') RETURNING id`,
    );
    return result.rows[0]!.id;
  }

  async function addWidget(
    dashboardId: string | null,
    widget: { name: string; visualisation?: string; source?: string; layout: Layout | null },
  ): Promise<void> {
    await db.query(
      `INSERT INTO widget (name, query, visualisation, source, dashboard_id, layout)
       VALUES ($1, '{}', $2, $3, $4, $5)`,
      [
        widget.name,
        widget.visualisation ?? 'table',
        widget.source ?? 'query',
        dashboardId,
        widget.layout && JSON.stringify(widget.layout),
      ],
    );
  }

  async function layouts(): Promise<Record<string, Layout | null>> {
    const result = await db.query<{ name: string; layout: Layout | null }>(
      'SELECT name, layout FROM widget',
    );
    return Object.fromEntries(result.rows.map((row) => [row.name, row.layout]));
  }

  it('lays every Dashboard out three across in Story order, each at its default height, and back', async () => {
    const story = await addDashboard();
    const story8 = (y: number): Layout => ({ x: 0, y, w: 6, h: 8 });
    await addWidget(story, { name: 'number', visualisation: 'number', layout: story8(0) });
    await addWidget(story, { name: 'balances', source: 'account_balances', layout: story8(1) });
    await addWidget(story, { name: 'line', visualisation: 'line', layout: story8(2) });
    await addWidget(story, { name: 'table', layout: story8(3) });
    await addWidget(story, { name: 'bars', visualisation: 'stacked_bar', layout: story8(4) });
    await addWidget(story, { name: 'donut', visualisation: 'donut', layout: story8(5) });
    await addWidget(story, { name: 'last', visualisation: 'number', layout: story8(6) });
    // A layout left from the former grid is read in grid order: by y, then x.
    const grid = await addDashboard();
    await addWidget(grid, { name: 'right', layout: { x: 6, y: 0, w: 6, h: 8 } });
    await addWidget(grid, { name: 'below', layout: { x: 0, y: 8, w: 12, h: 4 } });
    await addWidget(grid, { name: 'left', layout: { x: 0, y: 0, w: 6, h: 8 } });
    await addWidget(null, { name: 'standalone', layout: null });

    expect(await migrate(url, { quiet: true })).toContain(GRID_MIGRATION);

    expect(await layouts()).toEqual({
      // Row 1: as tall as its tallest card (6).
      number: { x: 0, y: 0, w: 4, h: 3 },
      balances: { x: 4, y: 0, w: 4, h: 6 },
      line: { x: 8, y: 0, w: 4, h: 6 },
      // Row 2 (tallest 8), then row 3.
      table: { x: 0, y: 6, w: 4, h: 8 },
      bars: { x: 4, y: 6, w: 4, h: 6 },
      donut: { x: 8, y: 6, w: 4, h: 8 },
      last: { x: 0, y: 14, w: 4, h: 3 },
      left: { x: 0, y: 0, w: 4, h: 8 },
      right: { x: 4, y: 0, w: 4, h: 8 },
      below: { x: 8, y: 0, w: 4, h: 8 },
      standalone: null,
    });

    await migrate(url, { direction: 'down', quiet: true });

    // Back to Story order: the nth Widget in reading order at y n, x 0, its size kept.
    expect(await layouts()).toEqual({
      number: { x: 0, y: 0, w: 4, h: 3 },
      balances: { x: 0, y: 1, w: 4, h: 6 },
      line: { x: 0, y: 2, w: 4, h: 6 },
      table: { x: 0, y: 3, w: 4, h: 8 },
      bars: { x: 0, y: 4, w: 4, h: 6 },
      donut: { x: 0, y: 5, w: 4, h: 8 },
      last: { x: 0, y: 6, w: 4, h: 3 },
      left: { x: 0, y: 0, w: 4, h: 8 },
      right: { x: 0, y: 1, w: 4, h: 8 },
      below: { x: 0, y: 2, w: 4, h: 8 },
      standalone: null,
    });
  });
});
