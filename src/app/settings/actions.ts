'use server';

import { revalidatePath } from 'next/cache';
import type { DateFormat, DisplaySettings, NumberFormat } from '@/lib/format';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getServiceContext } from '@/server/app-context';
import { updateDisplaySettings } from '@/server/services/settings';

export async function updateDisplaySettingsAction(
  _previous: ActionResult<DisplaySettings> | null,
  formData: FormData,
): Promise<ActionResult<DisplaySettings>> {
  const result = await runAction(async () =>
    updateDisplaySettings(await getServiceContext(), {
      // Validated by the service; the casts only satisfy the compile-time input type.
      numberFormat: formText(formData, 'numberFormat') as NumberFormat,
      dateFormat: formText(formData, 'dateFormat') as DateFormat,
    }),
  );
  // Every page renders through the formatter, so refresh them all.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
