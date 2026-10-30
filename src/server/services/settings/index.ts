import { z } from 'zod';
import {
  DATE_FORMATS,
  DEFAULT_DISPLAY_SETTINGS,
  NUMBER_FORMATS,
  type DisplaySettings,
} from '@/lib/format';
import type { Queryable } from '@/server/db/client';
import { mutate, type ServiceContext } from '../context';
import { parseInput } from '../errors';

const displaySettingsInput = z.object({
  numberFormat: z.enum(Object.keys(NUMBER_FORMATS) as [keyof typeof NUMBER_FORMATS], {
    error: 'Unknown number format',
  }),
  dateFormat: z.enum(DATE_FORMATS, { error: 'Unknown date format' }),
});

const SETTINGS_ENTITY_ID = 'display';

async function readDisplaySettings(db: Queryable, lock = false): Promise<DisplaySettings> {
  const result = await db.query<DisplaySettings>(
    `SELECT number_format AS "numberFormat", date_format AS "dateFormat" FROM settings${
      lock ? ' FOR UPDATE' : ''
    }`,
  );
  const row = result.rows[0];
  if (!row) return DEFAULT_DISPLAY_SETTINGS;
  // A format saved by an older version may no longer exist: fall back to the defaults.
  const parsed = displaySettingsInput.safeParse(row);
  return parsed.success ? parsed.data : DEFAULT_DISPLAY_SETTINGS;
}

export async function getDisplaySettings(ctx: ServiceContext): Promise<DisplaySettings> {
  return readDisplaySettings(ctx.db);
}

export async function updateDisplaySettings(
  ctx: ServiceContext,
  input: DisplaySettings,
): Promise<DisplaySettings> {
  const settings = parseInput(displaySettingsInput, input);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await readDisplaySettings(tx, true);
    await tx.query(
      `INSERT INTO settings (number_format, date_format) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE
         SET number_format = EXCLUDED.number_format,
             date_format = EXCLUDED.date_format,
             updated_at = now()`,
      [settings.numberFormat, settings.dateFormat],
    );
    await history.record('settings', SETTINGS_ENTITY_ID, { ...before }, { ...settings });
    return settings;
  });
}
