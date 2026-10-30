import type { Queryable } from '@/server/db/client';

/**
 * Whether the Transaction is one side of a Transfer. Transfers have no Category (domain rules),
 * so classification refuses to set one and Rules leave it alone when this is true.
 */
export async function isInTransfer(db: Queryable, transactionId: string): Promise<boolean> {
  return anyInTransfer(db, [transactionId]);
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
