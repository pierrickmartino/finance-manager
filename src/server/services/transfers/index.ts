import { z } from 'zod';
import { mutate, type ServiceContext } from '../context';
import { NotFoundError, parseInput } from '../errors';
import { IS_SPLIT } from '../transactions/split-guard';
import { linkPair, unlinkSide, type Transfer } from './link';
import {
  sideLabel,
  SPLIT_LINE_SIDE_COLUMNS,
  TRANSACTION_SIDE_COLUMNS,
  toSideViews,
  transferSideInput,
  type SideRow,
  type TransferSideRef,
  type TransferSideView,
} from './sides';

export type { ImportTransferCandidate } from './candidates';
export type { Transfer } from './link';
export {
  splitLineSide,
  transactionSide,
  type CandidateTransaction,
  type TransferSideKind,
  type TransferSideRef,
  type TransferSideView,
} from './sides';
export {
  CROSS_CURRENCY_TOLERANCE_PERCENT,
  TRANSFER_MAX_DAYS,
  type TransferCandidate,
} from './matcher';

const linkInput = z.object({
  sides: z.array(transferSideInput).length(2, 'Choose the two sides of the Transfer'),
});

export type LinkTransferInput = z.input<typeof linkInput>;

/**
 * Links two sides as a Transfer (spec 88, ADR-0005), each a whole Transaction or a Split line:
 * they must be on different Accounts (a line takes its Transaction's), have opposite signs and
 * not be in a Transfer yet; a split Transaction can only be linked by its lines. Amounts and
 * dates are not checked: this fixes what detection missed. Clears the Category on both sides.
 * One History Batch.
 */
export async function linkTransfer(
  ctx: ServiceContext,
  input: LinkTransferInput,
): Promise<Transfer> {
  const { sides } = parseInput(linkInput, input);
  return mutate(ctx, (scope) => linkPair(scope, sides));
}

/** Days either side of a Transaction searched for manual link options. */
export const LINK_OPTION_DAYS = 31;
const MAX_LINK_OPTIONS = 50;

/**
 * SQL `WITH me AS (...)`: the side named by `$1` (kind) and `$2` (id), with its Account,
 * amount, booking date and Transfer.
 */
const ME = `WITH me AS (
    SELECT t.account_id, t.amount_minor, t.booking_date, t.transfer_id
    FROM "transaction" t WHERE $1 = 'transaction' AND t.id = $2::uuid
    UNION ALL
    SELECT t.account_id, sl.amount_minor, t.booking_date, sl.transfer_id
    FROM split_line sl JOIN "transaction" t ON t.id = sl.transaction_id
    WHERE $1 = 'splitLine' AND sl.id = $2::uuid
  )`;

const isSideRef = (side: TransferSideRef): boolean => transferSideInput.safeParse(side).success;

/** The other side of this side's Transfer, a whole Transaction or a Split line; null if none. */
export async function getTransferCounterpart(
  ctx: ServiceContext,
  side: TransferSideRef,
): Promise<TransferSideView | null> {
  if (!isSideRef(side)) return null;
  const result = await ctx.db.query<SideRow>(
    `${ME}
     SELECT * FROM (
       SELECT ${TRANSACTION_SIDE_COLUMNS} FROM "transaction" t JOIN me USING (transfer_id)
       UNION ALL
       SELECT ${SPLIT_LINE_SIDE_COLUMNS} FROM split_line sl JOIN me USING (transfer_id)
     ) side WHERE NOT (side.kind = $1 AND side.id = $2::uuid)`,
    [side.kind, side.id],
  );
  return (await toSideViews(ctx.db, result.rows))[0] ?? null;
}

/** SQL: `t` (a Transaction, or a Split line's) is eligible to pair with `me`, bar its sign. */
const ELIGIBLE_FOR_ME = `t.account_id <> me.account_id
  AND t.booking_date BETWEEN me.booking_date - $3::int AND me.booking_date + $3::int`;

/**
 * The sides the user may link with this side by hand (spec 88, ADR-0005): unsplit whole
 * Transactions and Split lines, on another Account, with the opposite sign, not in a Transfer,
 * booked (a line by its Transaction) within a month. Closest amount first, then date, then
 * whole Transactions before Split lines.
 */
export async function listLinkOptions(
  ctx: ServiceContext,
  side: TransferSideRef,
): Promise<TransferSideView[]> {
  if (!isSideRef(side)) throw new NotFoundError('Transaction not found');
  const result = await ctx.db.query<SideRow>(
    `${ME}
     SELECT kind, id, "transactionId", "amountMinor" FROM (
       SELECT ${TRANSACTION_SIDE_COLUMNS}, t.booking_date FROM "transaction" t CROSS JOIN me
       WHERE ${ELIGIBLE_FOR_ME} AND t.transfer_id IS NULL AND NOT ${IS_SPLIT}
         AND sign(t.amount_minor) = -sign(me.amount_minor)
       UNION ALL
       SELECT ${SPLIT_LINE_SIDE_COLUMNS}, t.booking_date
       FROM split_line sl JOIN "transaction" t ON t.id = sl.transaction_id CROSS JOIN me
       WHERE ${ELIGIBLE_FOR_ME} AND sl.transfer_id IS NULL
         AND sign(sl.amount_minor) = -sign(me.amount_minor)
     ) option CROSS JOIN me
     ORDER BY abs(option."amountMinor" + me.amount_minor),
       abs(option.booking_date - me.booking_date), option.kind = 'splitLine', option.id
     LIMIT $4`,
    [side.kind, side.id, LINK_OPTION_DAYS, MAX_LINK_OPTIONS],
  );
  return toSideViews(ctx.db, result.rows);
}

/**
 * Unlinks the Transfer this side, a whole Transaction or a Split line, is in; both sides stay,
 * unlinked. A Split line side is left with neither a Category nor a Transfer, so its
 * Transaction is Unclassified until the line gets one (ADR-0005). One History Batch.
 */
export async function unlinkTransfer(ctx: ServiceContext, side: TransferSideRef): Promise<void> {
  if (!isSideRef(side)) {
    // An unknown kind reads as a Transaction, as before Split line sides existed.
    const kind = side.kind === 'splitLine' ? 'splitLine' : 'transaction';
    throw new NotFoundError(`${sideLabel(kind)} not found`);
  }
  await mutate(ctx, (scope) => unlinkSide(scope, side));
}
