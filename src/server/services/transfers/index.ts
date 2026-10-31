import { z } from 'zod';
import { mutate, type ServiceContext } from '../context';
import { NotFoundError, parseInput, ValidationError } from '../errors';
import { SELECT_TRANSACTION } from '../transactions/model';
import type { CandidateTransaction } from './candidates';
import { linkPair, unlinkTransfers, type Transfer } from './link';

export type { CandidateTransaction, ImportTransferCandidate } from './candidates';
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

/** Days either side of a Transaction searched for manual link options. */
export const LINK_OPTION_DAYS = 31;
const MAX_LINK_OPTIONS = 50;

const SELECT_WITH_ACCOUNT = SELECT_TRANSACTION.replace(
  'FROM "transaction" t',
  `, a.name AS "accountName" FROM "transaction" t JOIN account a ON a.id = t.account_id`,
);

/** The other side of the Transaction's Transfer, or null when it is not in one. */
export async function getTransferCounterpart(
  ctx: ServiceContext,
  id: string,
): Promise<CandidateTransaction | null> {
  if (!transactionId.safeParse(id).success) return null;
  const result = await ctx.db.query<CandidateTransaction>(
    `${SELECT_WITH_ACCOUNT}
     WHERE t.transfer_id = (SELECT transfer_id FROM "transaction" WHERE id = $1) AND t.id <> $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * Transactions the user may link with this one by hand (spec 88): on another Account, with the
 * opposite sign, not in a Transfer, booked within a month. Closest amount first, then date.
 */
export async function listLinkOptions(
  ctx: ServiceContext,
  id: string,
): Promise<CandidateTransaction[]> {
  if (!transactionId.safeParse(id).success) throw new NotFoundError('Transaction not found');
  const result = await ctx.db.query<CandidateTransaction>(
    `WITH me AS (SELECT * FROM "transaction" WHERE id = $1)
     ${SELECT_WITH_ACCOUNT} CROSS JOIN me
     WHERE t.account_id <> me.account_id AND t.transfer_id IS NULL
       AND sign(t.amount_minor) = -sign(me.amount_minor)
       AND t.booking_date BETWEEN me.booking_date - $2::int AND me.booking_date + $2::int
     ORDER BY abs(t.amount_minor + me.amount_minor), abs(t.booking_date - me.booking_date), t.id
     LIMIT $3`,
    [id, LINK_OPTION_DAYS, MAX_LINK_OPTIONS],
  );
  return result.rows;
}

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
