import 'server-only';
import { cache } from 'react';
import { createFormatter, type DisplaySettings, type Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getDisplaySettings } from '@/server/services/settings';

/** The user's display settings, read once per request. */
export const getRequestDisplaySettings = cache(async (): Promise<DisplaySettings> => {
  return getDisplaySettings(await getServiceContext());
});

/** The shared formatter for server components. */
export async function getFormatter(): Promise<Formatter> {
  return createFormatter(await getRequestDisplaySettings());
}
