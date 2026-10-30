import 'server-only';
import { cache } from 'react';
import { createFormatter, type DisplaySettings, type Formatter } from '@/lib/format';
import { getPublicServiceContext } from '@/server/app-context';
import { getDisplaySettings } from '@/server/services/settings';

/**
 * The user's display settings, read once per request. Public, because the shared layout also
 * renders the login and setup pages; formats are not sensitive.
 */
export const getRequestDisplaySettings = cache(async (): Promise<DisplaySettings> => {
  return getDisplaySettings(await getPublicServiceContext());
});

/** The shared formatter for server components. */
export async function getFormatter(): Promise<Formatter> {
  return createFormatter(await getRequestDisplaySettings());
}
