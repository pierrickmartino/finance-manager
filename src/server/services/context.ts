import type pg from 'pg';
import type { Db } from '@/server/db/client';
import { withTransaction } from '@/server/db/transaction';
import { createHistoryRecorder, type HistoryRecorder } from './history/recorder';

/** Who caused a change. Mirrors the History entry actor types in GLOSSARY.md. */
export type ActorType = 'manual' | 'rule' | 'import' | 'system';

export interface Actor {
  type: ActorType;
  id: string | null;
}

/**
 * Everything a service operation needs. Every operation takes it as its first argument.
 * Adapters (server actions, route handlers) get one from `getServiceContext()`;
 * tests get one from `setupTestDatabase()`.
 */
export interface ServiceContext {
  db: Db;
  actor: Actor;
}

/** What a mutating operation works with: the open transaction, the acting party and History. */
export interface MutationScope {
  tx: pg.PoolClient;
  actor: Actor;
  /** Records this mutation's History entries: all in one Batch, all inside `tx`. */
  history: HistoryRecorder;
}

/**
 * The one way to write domain data: runs `fn` in a single database transaction.
 * One call is one user action, so it is one Batch: every `history.record(...)` made in `fn`
 * shares the Batch id and commits or rolls back together with the change it describes.
 */
export function mutate<T>(
  ctx: ServiceContext,
  fn: (scope: MutationScope) => Promise<T>,
): Promise<T> {
  return withTransaction(ctx.db, (tx) =>
    fn({ tx, actor: ctx.actor, history: createHistoryRecorder(tx, ctx.actor) }),
  );
}
