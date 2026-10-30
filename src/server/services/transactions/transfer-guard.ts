import type { Queryable } from '@/server/db/client';

/**
 * Whether the Transaction is one side of a Transfer. Transfers have no Category (domain rules),
 * so classification refuses to set one when this is true.
 *
 * #19 Transfers: there is no `transfer_id` column yet, so this is always false. Replace the body
 * with `SELECT transfer_id IS NOT NULL ...`, add the service test "a Transfer can't be given a
 * Category", and clear the Category when a Transfer is confirmed.
 */
export async function isInTransfer(_db: Queryable, _transactionId: string): Promise<boolean> {
  return false;
}
