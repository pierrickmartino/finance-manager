import type { Queryable } from '@/server/db/client';
import { ValidationError } from '../errors';

/**
 * A split Transaction has no Category of its own: its Split lines hold the Categories
 * (ADR-0004). A Transaction is split when it has Split lines; there is no flag, so every
 * "is split" check is the same EXISTS over `split_line`, written once here.
 */

/**
 * SQL condition: the Transaction (alias `transaction`, default `t`) has a Split line, optionally
 * one meeting `lineCondition` (Split line alias `sl`).
 */
export function splitLineExists(lineCondition?: string, transaction = 't'): string {
  const extra = lineCondition ? ` AND ${lineCondition}` : '';
  return `EXISTS (SELECT 1 FROM split_line sl WHERE sl.transaction_id = ${transaction}.id${extra})`;
}

/** SQL condition (alias `t`): the Transaction is split. */
export const IS_SPLIT = splitLineExists();

/** Whether at least one of the Transactions is split (one query). */
export async function anySplit(db: Queryable, transactionIds: readonly string[]): Promise<boolean> {
  if (transactionIds.length === 0) return false;
  const result = await db.query(
    `SELECT 1 FROM "transaction" t WHERE t.id = ANY($1::uuid[]) AND ${IS_SPLIT} LIMIT 1`,
    [transactionIds],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Refuses a Category change on any split Transaction among these (ValidationError): the
 * Split would be silently discarded otherwise. One query.
 */
export async function refuseSplitCategoryChange(
  db: Queryable,
  transactionIds: readonly string[],
): Promise<void> {
  if (await anySplit(db, transactionIds)) {
    throw new ValidationError(
      'This Transaction is split: edit or remove its Split to change its Category',
    );
  }
}
