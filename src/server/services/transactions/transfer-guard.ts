import type { Queryable } from '@/server/db/client';

/**
 * Transfers have no Category (domain rules), so classification refuses to set one and Rules
 * leave a Transaction in a Transfer alone. A split Transaction has no Category of its own
 * either: its Split lines hold the Categories (ADR-0004). These checks are set-based: one query for any
 * number of Transactions. A single locked Transaction carries `transferId` itself.
 */

/** The ids among these Transactions that are one side of a Transfer (one query). */
export async function transfersAmong(
  db: Queryable,
  transactionIds: readonly string[],
): Promise<Set<string>> {
  if (transactionIds.length === 0) return new Set();
  const result = await db.query<{ id: string }>(
    `SELECT id FROM "transaction" WHERE id = ANY($1::uuid[]) AND transfer_id IS NOT NULL`,
    [transactionIds],
  );
  return new Set(result.rows.map((row) => row.id));
}

/** Whether at least one of the Transactions is one side of a Transfer (one query). */
export async function anyInTransfer(
  db: Queryable,
  transactionIds: readonly string[],
): Promise<boolean> {
  if (transactionIds.length === 0) return false;
  const result = await db.query(
    `SELECT 1 FROM "transaction" WHERE id = ANY($1::uuid[]) AND transfer_id IS NOT NULL LIMIT 1`,
    [transactionIds],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Why a split Transaction's own Category can't change (ADR-0004). */
export const SPLIT_CATEGORY_REFUSAL =
  'This Transaction is split: edit or remove its Split to change its Category';

/** The ids among these Transactions that are split (one query). */
export async function splitAmong(
  db: Queryable,
  transactionIds: readonly string[],
): Promise<Set<string>> {
  if (transactionIds.length === 0) return new Set();
  const result = await db.query<{ id: string }>(
    `SELECT DISTINCT transaction_id AS id FROM split_line WHERE transaction_id = ANY($1::uuid[])`,
    [transactionIds],
  );
  return new Set(result.rows.map((row) => row.id));
}
