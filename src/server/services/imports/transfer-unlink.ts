import type { MutationScope } from '../context';

/**
 * Unlinks every Transfer the given Transactions belong to, before they are deleted (Import undo,
 * deleting an imported Transaction). The other side of each Transfer stays, unlinked, and the
 * unlink is recorded in the caller's History Batch.
 *
 * Transfers don't exist yet: this is the hook the Transfers ticket (#19) fills in. Until then
 * no Transaction can be part of a Transfer, so there is nothing to unlink.
 */
export async function unlinkTransfers(
  _scope: Pick<MutationScope, 'tx' | 'history'>,
  _transactionIds: readonly string[],
): Promise<void> {
  return Promise.resolve();
}
