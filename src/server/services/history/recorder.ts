import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Actor } from '../context';

/**
 * The kinds of domain entity History knows about. Add yours here when a ticket introduces
 * a new entity (transaction, rule, payee, ...). The value is stored in `history_entry.entity_type`.
 */
export const HISTORY_ENTITY_TYPES = [
  'bank',
  'account',
  'settings',
  'import',
  'transaction',
  'balance_snapshot',
  'category_group',
  'category',
  'payee',
  'tag',
  'rule',
  'transfer',
  'widget',
  'dashboard',
] as const;
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

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
  /**
   * `record` for many entities of one type in one INSERT: the same entries, in the same order,
   * as one `record` call per change. Use it when one action touches many entities (bulk edit,
   * applying Rules, an Import commit).
   */
  recordMany(entityType: HistoryEntityType, changes: readonly EntityChange[]): Promise<void>;
  /**
   * Gives the Batch one readable summary, for actions that touch many entities (a merge, a
   * bulk edit). Calling it again replaces the summary.
   */
  summarize(summary: string): Promise<void>;
  /**
   * A recorder for the same Batch (same id, timestamp and transaction) that records another
   * actor. Rules use it: a Rule classifying a Transaction during an Import or a manual save
   * joins that action's Batch, but its entries name the Rule as their actor.
   */
  as(actor: Actor): HistoryRecorder;
}

/** How one entity changed, for `recordMany`. */
export interface EntityChange {
  entityId: string;
  before: HistorySnapshot | null;
  after: HistorySnapshot | null;
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

/** Rows per INSERT, so one statement's parameter arrays stay a few MB at most. */
const MAX_ROWS_PER_INSERT = 20_000;

type EntryRow = FieldChange & { entityId: string };

export function createHistoryRecorder(
  tx: pg.PoolClient,
  actor: Actor,
  batchId: string = randomUUID(),
): HistoryRecorder {
  /** Inserts the rows in order: `seq` follows the array order. */
  async function insert(entityType: HistoryEntityType, rows: readonly EntryRow[]): Promise<void> {
    for (let start = 0; start < rows.length; start += MAX_ROWS_PER_INSERT) {
      const chunk = rows.slice(start, start + MAX_ROWS_PER_INSERT);
      await tx.query(
        `INSERT INTO history_entry
           (batch_id, actor_type, actor_id, entity_type, entity_id, field, before, after)
         SELECT $1, $2, $3, $4, change.entity_id, change.field, change.before, change.after
         FROM unnest($5::text[], $6::text[], $7::jsonb[], $8::jsonb[]) WITH ORDINALITY
           AS change(entity_id, field, before, after, n)
         ORDER BY change.n`,
        [
          batchId,
          actor.type,
          actor.id,
          entityType,
          chunk.map((row) => row.entityId),
          chunk.map((row) => row.field),
          chunk.map((row) => row.before),
          chunk.map((row) => row.after),
        ],
      );
    }
  }

  return {
    batchId,
    async record(entityType, entityId, before, after) {
      await insert(
        entityType,
        diff(before, after).map((change) => ({ ...change, entityId })),
      );
    },
    async recordMany(entityType, changes) {
      await insert(
        entityType,
        changes.flatMap(({ entityId, before, after }) =>
          diff(before, after).map((change) => ({ ...change, entityId })),
        ),
      );
    },
    async summarize(summary) {
      await tx.query(
        `INSERT INTO history_batch (id, summary) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET summary = EXCLUDED.summary`,
        [batchId, summary],
      );
    },
    as(other) {
      return createHistoryRecorder(tx, other, batchId);
    },
  };
}
