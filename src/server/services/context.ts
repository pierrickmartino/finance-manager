import type pg from 'pg';
import type { Db } from '@/server/db/client';
import { withTransaction } from '@/server/db/transaction';

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

/** What a mutating operation works with: the open transaction and the acting party. */
export interface MutationScope {
  tx: pg.PoolClient;
  actor: Actor;
}

/**
 * The one way to write domain data: runs `fn` in a single database transaction.
 * The History recorder (#5) hooks in here, so every mutation records its History
 * entries inside the same transaction and one call produces one Batch.
 */
export function mutate<T>(
  ctx: ServiceContext,
  fn: (scope: MutationScope) => Promise<T>,
): Promise<T> {
  return withTransaction(ctx.db, (tx) => fn({ tx, actor: ctx.actor }));
}
