import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Actor } from '../context';

/**
 * The kinds of domain entity History knows about. Add yours here when a ticket introduces
 * a new entity (transaction, rule, payee, ...). The value is stored in `history_entry.entity_type`.
 */
export type HistoryEntityType = 'bank' | 'account' | 'settings';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * The recorded fields of one entity at one moment, keyed by field name (camelCase, as the
 * service returns them). Amounts are integer minor units, dates ISO strings.
 * `undefined` counts as null, so optional fields can be passed straight through.
 */
export type HistorySnapshot = Readonly<Record<string, JsonValue | undefined>>;

/**
 * Records History entries inside the current mutation. One recorder exists per `mutate` call,
 * and every entry it writes shares its Batch id, actor, timestamp and database transaction.
 */
export interface HistoryRecorder {
  /** The Batch this mutation's entries belong to. */
  readonly batchId: string;
  /**
   * Records how one entity changed: one entry per field whose value differs between the two
   * snapshots. Pass `before: null` for a creation and `after: null` for a deletion.
   * Unchanged fields, and calls with no change at all, write nothing.
   */
  record(
    entityType: HistoryEntityType,
    entityId: string,
    before: HistorySnapshot | null,
    after: HistorySnapshot | null,
  ): Promise<void>;
}

interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

/** JSON text of a field's value, or null when the field has no value. */
function toJson(value: JsonValue | undefined): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function diff(before: HistorySnapshot | null, after: HistorySnapshot | null): FieldChange[] {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...fields]
    .map((field) => ({
      field,
      before: toJson(before?.[field]),
      after: toJson(after?.[field]),
    }))
    .filter((change) => change.before !== change.after);
}

export function createHistoryRecorder(tx: pg.PoolClient, actor: Actor): HistoryRecorder {
  const batchId = randomUUID();
  return {
    batchId,
    async record(entityType, entityId, before, after) {
      const changes = diff(before, after);
      if (changes.length === 0) return;
      await tx.query(
        `INSERT INTO history_entry
           (batch_id, actor_type, actor_id, entity_type, entity_id, field, before, after)
         SELECT $1, $2, $3, $4, $5, change.field, change.before, change.after
         FROM unnest($6::text[], $7::jsonb[], $8::jsonb[]) WITH ORDINALITY
           AS change(field, before, after, n)
         ORDER BY change.n`,
        [
          batchId,
          actor.type,
          actor.id,
          entityType,
          entityId,
          changes.map((change) => change.field),
          changes.map((change) => change.before),
          changes.map((change) => change.after),
        ],
      );
    },
  };
}
