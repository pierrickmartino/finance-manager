'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formPosition, formText, runAction, type ActionResult } from '@/server/actions';
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
  reorderDashboardWidgets,
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

/** Adds the Account balances in CHF to a Dashboard, at the form's `position` (else last). */
export async function addBalancesWidgetAction(
  dashboardId: string,
  _previous: Result | null,
  formData: FormData,
) {
  return run(async () =>
    addWidget(await getServiceContext(), dashboardId, {
      name: 'Account balances in CHF',
      source: 'account_balances',
      query: { ...DEFAULT_WIDGET_QUERY, rows: 'account', columns: null },
      visualisation: 'table',
      position: formPosition(formData),
    }),
  );
}

/**
 * Places a copy of a saved Widget on a Dashboard, at the form's `position` (else last); the
 * original is left as it is.
 */
export async function copyWidgetToDashboardAction(
  dashboardId: string,
  _previous: Result | null,
  formData: FormData,
) {
  return run(async () =>
    copyWidgetToDashboard(
      await getServiceContext(),
      formText(formData, 'widgetId'),
      dashboardId,
      formPosition(formData),
    ),
  );
}

export async function duplicateWidgetAction(widgetId: string, _previous: Result | null) {
  return run(async () => duplicateWidget(await getServiceContext(), widgetId));
}

export async function deleteDashboardWidgetAction(widgetId: string, _previous: Result | null) {
  return run(async () => deleteWidget(await getServiceContext(), widgetId));
}

/** Saves the Widgets' Story order after a move. Writes no History. */
export async function reorderWidgetsAction(
  dashboardId: string,
  widgetIds: string[],
): Promise<ActionResult<void>> {
  return runAction(async () =>
    reorderDashboardWidgets(await getServiceContext(), dashboardId, widgetIds),
  );
}
