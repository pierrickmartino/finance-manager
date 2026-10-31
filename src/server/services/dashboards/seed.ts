import { mutate, type ServiceContext } from '../context';
import { widgetQueryInput, type WidgetQueryInput } from '../reporting/query';
import {
  insertWidget,
  type Visualisation,
  type WidgetLayout,
  type WidgetSource,
} from '../reporting/widgets';
import { insertDashboard } from '.';

export const STARTER_DASHBOARD_NAME = 'Overview';

const LAST_12_MONTHS = { kind: 'last', count: 12, unit: 'month' } as const;

/** The starter Widgets (spec 106), with their place on the grid. */
export const STARTER_WIDGETS: ReadonlyArray<{
  name: string;
  source: WidgetSource;
  query: WidgetQueryInput;
  visualisation: Visualisation;
  layout: WidgetLayout;
}> = [
  {
    // Income and expense only: Capital and Transfers stay out.
    name: 'Income vs. expense',
    source: 'query',
    query: {
      dateRange: LAST_12_MONTHS,
      rows: 'month',
      columns: 'categoryGroupType',
      filters: { categoryGroupTypes: ['income', 'expense'] },
    },
    visualisation: 'stacked_bar',
    layout: { x: 0, y: 0, w: 6, h: 8 },
  },
  {
    // Every flow in or out except Transfers, Capital included.
    name: 'Net cash flow',
    source: 'query',
    query: { dateRange: LAST_12_MONTHS, rows: 'month', columns: null, includeCapital: true },
    visualisation: 'line',
    layout: { x: 6, y: 0, w: 6, h: 8 },
  },
  {
    name: 'Spending by Category',
    source: 'query',
    query: {
      dateRange: LAST_12_MONTHS,
      rows: 'category',
      columns: null,
      filters: { categoryGroupTypes: ['expense'] },
    },
    visualisation: 'donut',
    layout: { x: 0, y: 8, w: 6, h: 9 },
  },
  {
    name: 'Account balances in CHF',
    source: 'account_balances',
    query: { dateRange: LAST_12_MONTHS, rows: 'account', columns: null },
    visualisation: 'table',
    layout: { x: 6, y: 8, w: 6, h: 9 },
  },
];

const SEED_NAME = 'starter_dashboard';

/**
 * Seeds the starter Dashboard on first run. Idempotent: it runs once per database, ever, so a
 * user who deletes it doesn't get it back. Returns whether it seeded. Written by the system
 * actor, as one Batch.
 */
export async function seedStarterDashboard(ctx: ServiceContext): Promise<boolean> {
  return mutate({ ...ctx, actor: { type: 'system', id: null } }, async (scope) => {
    const claimed = await scope.tx.query(
      `INSERT INTO first_run_seed (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [SEED_NAME],
    );
    if (claimed.rowCount === 0) return false;
    const dashboard = await insertDashboard(scope, STARTER_DASHBOARD_NAME);
    for (const widget of STARTER_WIDGETS) {
      await insertWidget(scope, {
        ...widget,
        query: widgetQueryInput.parse(widget.query),
        dashboardId: dashboard.id,
      });
    }
    await scope.history.summarize('Seeded the starter Dashboard');
    return true;
  });
}
