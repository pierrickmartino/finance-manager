import type { Queryable } from '@/server/db/client';

/**
 * Transfers have no Category (domain rules), so classification refuses to set one and Rules
 * leave a Transaction in a Transfer alone. These checks are set-based: one query for any
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
