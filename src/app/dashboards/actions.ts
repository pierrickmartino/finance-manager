'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import {
  addWidget,
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  duplicateWidget,
  listDashboards,
  renameDashboard,
  reorderDashboards,
  saveDashboardLayout,
  type DashboardLayoutInput,
} from '@/server/services/dashboards';
import { deleteWidget } from '@/server/services/reporting';
import { DEFAULT_WIDGET_QUERY } from '@/lib/reporting/widget-params';

type Result = ActionResult<unknown>;

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await runAction(fn);
  if (result.ok) revalidatePath('/dashboards', 'layout');
  return result;
}

/** `ids` with `id` moved one place up (-1) or down (+1). */
function shifted(ids: string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const order = [...ids];
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order;
}

export async function createDashboardAction(_previous: Result | null, formData: FormData) {
  const result = await run(async () =>
    createDashboard(await getServiceContext(), { name: formText(formData, 'name') }),
  );
  if (!result.ok) return result;
  redirect(`/dashboards/${result.data.id}`);
}

export async function renameDashboardAction(
  id: string,
  _previous: Result | null,
  formData: FormData,
) {
  return run(async () =>
    renameDashboard(await getServiceContext(), id, { name: formText(formData, 'name') }),
  );
}

export async function shiftDashboardAction(id: string, delta: -1 | 1, _previous: Result | null) {
  return run(async () => {
    const ctx = await getServiceContext();
    const ids = (await listDashboards(ctx)).map((dashboard) => dashboard.id);
    await reorderDashboards(ctx, shifted(ids, id, delta));
  });
}

export async function duplicateDashboardAction(id: string, _previous: Result | null) {
  const result = await run(async () => duplicateDashboard(await getServiceContext(), id));
  if (!result.ok) return result;
  redirect(`/dashboards/${result.data.id}`);
}

export async function deleteDashboardAction(id: string, _previous: Result | null) {
  const result = await run(async () => deleteDashboard(await getServiceContext(), id));
  if (!result.ok) return result;
  redirect('/dashboards');
}

/** Adds the Account balances in CHF to a Dashboard. */
export async function addBalancesWidgetAction(dashboardId: string, _previous: Result | null) {
  return run(async () =>
    addWidget(await getServiceContext(), dashboardId, {
      name: 'Account balances in CHF',
      source: 'account_balances',
      query: { ...DEFAULT_WIDGET_QUERY, rows: 'account', columns: null },
      visualisation: 'table',
    }),
  );
}

export async function duplicateWidgetAction(widgetId: string, _previous: Result | null) {
  return run(async () => duplicateWidget(await getServiceContext(), widgetId));
}

export async function deleteDashboardWidgetAction(widgetId: string, _previous: Result | null) {
  return run(async () => deleteWidget(await getServiceContext(), widgetId));
}

/** Saves Widget positions and sizes after a drag or resize. Writes no History. */
export async function saveLayoutAction(
  dashboardId: string,
  items: DashboardLayoutInput,
): Promise<ActionResult<void>> {
  return runAction(async () => saveDashboardLayout(await getServiceContext(), dashboardId, items));
}
