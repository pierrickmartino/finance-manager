'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { ValidationError } from '@/server/services/errors';
import {
  createWidget,
  deleteWidget,
  updateWidget,
  type Visualisation,
  type WidgetQueryInput,
  type WidgetSource,
} from '@/server/services/reporting';
import { addWidget } from '@/server/services/dashboards';

type Result = ActionResult<unknown>;

function readQuery(formData: FormData): WidgetQueryInput {
  try {
    return JSON.parse(formText(formData, 'query')) as WidgetQueryInput;
  } catch {
    throw new ValidationError('The Widget query could not be read. Reload the page and try again.');
  }
}

/** Saves the report shown in the editor as a new Widget, or updates the Widget being edited. */
export async function saveWidgetAction(_previous: Result | null, formData: FormData) {
  const widgetId = formText(formData, 'widgetId');
  const dashboardId = formText(formData, 'dashboardId');
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    const input = {
      name: formText(formData, 'name'),
      query: readQuery(formData),
      visualisation: (formText(formData, 'visualisation') || undefined) as Visualisation,
    };
    if (widgetId) return updateWidget(ctx, widgetId, input);
    // A new Widget's source; an edited Widget keeps its own.
    const created = {
      ...input,
      source: (formText(formData, 'source') || undefined) as WidgetSource | undefined,
    };
    return dashboardId ? addWidget(ctx, dashboardId, created) : createWidget(ctx, created);
  });
  if (!result.ok) return result;
  revalidatePath('/widgets', 'layout');
  revalidatePath('/dashboards', 'layout');
  redirect(
    result.data.dashboardId
      ? `/dashboards/${result.data.dashboardId}/edit`
      : `/widgets/${result.data.id}`,
  );
}

export async function deleteWidgetAction(
  id: string,
  _previous: Result | null,
  _formData: FormData,
) {
  const result = await runAction(async () => deleteWidget(await getServiceContext(), id));
  if (!result.ok) return result;
  revalidatePath('/widgets', 'layout');
  redirect('/widgets');
}
