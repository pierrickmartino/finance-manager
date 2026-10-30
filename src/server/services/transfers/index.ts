import { z } from 'zod';
import { mutate, type ServiceContext } from '../context';
import { NotFoundError, parseInput, ValidationError } from '../errors';
import { linkPair, unlinkTransfers, type Transfer } from './link';

export type { Transfer } from './link';
export {
  CROSS_CURRENCY_TOLERANCE_PERCENT,
  TRANSFER_MAX_DAYS,
  type TransferCandidate,
} from './matcher';

const linkInput = z.object({
  transactionIds: z
    .array(z.uuid({ error: 'Transaction not found' }))
    .length(2, 'Choose the two Transactions of the Transfer'),
});

export type LinkTransferInput = z.input<typeof linkInput>;

/**
 * Links any two Transactions as a Transfer (spec 88): they must be on different Accounts, have
 * opposite signs and not be in a Transfer yet. Amounts and dates are not checked: this fixes
 * what detection missed. Clears the Category on both sides. One History Batch.
 */
export async function linkTransfer(
  ctx: ServiceContext,
  input: LinkTransferInput,
): Promise<Transfer> {
  const { transactionIds } = parseInput(linkInput, input);
  return mutate(ctx, (scope) => linkPair(scope, transactionIds));
}

const transactionId = z.uuid();

/** Unlinks the Transfer the Transaction is one side of; both sides stay, unlinked. */
export async function unlinkTransfer(ctx: ServiceContext, id: string): Promise<void> {
  if (!transactionId.safeParse(id).success) throw new NotFoundError('Transaction not found');
  await mutate(ctx, async (scope) => {
    const found = await scope.tx.query<{ transferId: string | null }>(
      'SELECT transfer_id AS "transferId" FROM "transaction" WHERE id = $1 FOR UPDATE',
      [id],
    );
    const row = found.rows[0];
    if (!row) throw new NotFoundError('Transaction not found');
    if (!row.transferId) throw new ValidationError('This Transaction is not part of a Transfer');
    await unlinkTransfers(scope, [id]);
  });
}
