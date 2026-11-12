'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import {
  addWidget,
  copyWidgetToDashboard,
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  duplicateWidget,
  listDashboards,
  renameDashboard,
  reorderDashboards,
  saveDashboardLayout,
  type CellInput,
} from '@/server/services/dashboards';
import { deleteWidget } from '@/server/services/reporting';
import { moveBy } from '@/lib/reporting/order';
import { DEFAULT_WIDGET_QUERY } from '@/lib/reporting/widget-params';

type Result = ActionResult<unknown>;

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const result = await runAction(fn);
  if (result.ok) revalidatePath('/dashboards', 'layout');
  return result;
}

export async function createDashboardAction(_previous: Result | null, formData: FormData) {
  const result = await run(async () =>
    createDashboard(await getServiceContext(), { name: formText(formData, 'name') }),
  );
  if (!result.ok) return result;
  // A new Dashboard has no Widgets yet: open it where they are added.
  redirect(`/dashboards/${result.data.id}/edit`);
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
    await reorderDashboards(ctx, moveBy(ids, id, delta));
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

/** Adds the Account balances in CHF to a Dashboard, in the first free spot of its board. */
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

/**
 * Places a copy of a saved Widget in the first free spot of a Dashboard's board; the original
 * is left as it is.
 */
export async function copyWidgetToDashboardAction(
  dashboardId: string,
  _previous: Result | null,
  formData: FormData,
) {
  return run(async () =>
    copyWidgetToDashboard(await getServiceContext(), formText(formData, 'widgetId'), dashboardId),
  );
}

export async function duplicateWidgetAction(widgetId: string, _previous: Result | null) {
  return run(async () => duplicateWidget(await getServiceContext(), widgetId));
}

export async function deleteDashboardWidgetAction(widgetId: string, _previous: Result | null) {
  return run(async () => deleteWidget(await getServiceContext(), widgetId));
}

/**
 * Saves the whole board after a drop, a resize or a keyboard step in Edit mode. Writes no
 * History; the last save wins (ADR-0010).
 */
export async function saveDashboardLayoutAction(
  dashboardId: string,
  cells: CellInput[],
): Promise<ActionResult<void>> {
  // No revalidation: the editor already shows the board, and refetching would rerun every Widget.
  return runAction(async () => saveDashboardLayout(await getServiceContext(), dashboardId, cells));
}
