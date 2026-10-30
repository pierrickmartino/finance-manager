import { z } from 'zod';
import type { ActorType, ServiceContext } from '../context';
import { parseInput, ValidationError } from '../errors';
import type { HistoryEntityType, JsonValue } from './recorder';

export type { HistoryEntityType, HistoryRecorder, HistorySnapshot, JsonValue } from './recorder';

export interface HistoryEntry {
  id: string;
  batchId: string;
  at: Date;
  actorType: ActorType;
  actorId: string | null;
  entityType: HistoryEntityType;
  entityId: string;
  field: string;
  before: JsonValue;
  after: JsonValue;
}

export const ACTOR_TYPES = ['manual', 'rule', 'import', 'system'] as const satisfies ActorType[];

export const DEFAULT_HISTORY_LIMIT = 500;
const MAX_HISTORY_LIMIT = 2000;
const MAX_ID_LENGTH = 100;
/** Dates in History filters are calendar days in the user's (Swiss) local time. */
const HISTORY_TIME_ZONE = 'Europe/Zurich';

/** A filter field that is absent when blank, as an empty form field submits it. */
function optional<S extends z.ZodType>(schema: S) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const historyFilterInput = z.object({
  from: optional(z.iso.date({ error: 'From must be a date (YYYY-MM-DD)' })),
  to: optional(z.iso.date({ error: 'To must be a date (YYYY-MM-DD)' })),
  entityType: optional(z.string().trim().max(MAX_ID_LENGTH)),
  entityId: optional(z.string().trim().max(MAX_ID_LENGTH)),
  actorType: optional(z.enum(ACTOR_TYPES, { error: 'Unknown actor' })),
  actorId: optional(z.string().trim().max(MAX_ID_LENGTH)),
  batchId: optional(z.uuid({ error: 'Batch must be a Batch id' })),
  limit: z.number().int().min(1).max(MAX_HISTORY_LIMIT).default(DEFAULT_HISTORY_LIMIT),
});

/** Every field is optional; blank strings mean "no filter". */
export type HistoryFilter = z.input<typeof historyFilterInput>;

/** History entries matching every given filter, newest first, at most `limit` of them. */
export async function listHistory(
  ctx: ServiceContext,
  filter: HistoryFilter = {},
): Promise<HistoryEntry[]> {
  const input = parseInput(historyFilterInput, filter);
  if (input.from && input.to && input.from > input.to) {
    throw new ValidationError('From must not be after To');
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  const where = (sql: (param: string) => string, value: unknown): void => {
    if (value === undefined) return;
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };
  const localDay = `(at AT TIME ZONE '${HISTORY_TIME_ZONE}')::date`;
  where((p) => `${localDay} >= ${p}::date`, input.from);
  where((p) => `${localDay} <= ${p}::date`, input.to);
  where((p) => `entity_type = ${p}`, input.entityType);
  where((p) => `entity_id = ${p}`, input.entityId);
  where((p) => `actor_type = ${p}`, input.actorType);
  where((p) => `actor_id = ${p}`, input.actorId);
  where((p) => `batch_id = ${p}::uuid`, input.batchId);
  params.push(input.limit);

  const result = await ctx.db.query<HistoryEntry>(
    `SELECT id, batch_id AS "batchId", at, actor_type AS "actorType", actor_id AS "actorId",
            entity_type AS "entityType", entity_id AS "entityId", field, before, after
     FROM history_entry
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY seq DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}
