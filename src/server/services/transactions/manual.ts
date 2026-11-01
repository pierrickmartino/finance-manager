import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { ConflictError, NotFoundError, parseInput, ValidationError } from '../errors';
import { runRulesOnTransaction } from '../rules/apply';
import { unlinkTransfers } from '../transfers/link';
import { refuseBankFieldChanges } from './bank-fields';
import { deletionSnapshots } from './classification';
import { splitAmong } from './transfer-guard';
import {
  SELECT_TRANSACTION,
  TRANSACTION_ORDER,
  transactionSnapshot,
  type Transaction,
} from './model';

const MAX_TEXT_LENGTH = 500;

/** Optional text: absent, null or blank all mean "none" (null). */
const optionalText = z.preprocess(
  (value) =>
    value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value,
  z
    .string()
    .trim()
    .max(MAX_TEXT_LENGTH, `Text must be at most ${MAX_TEXT_LENGTH} characters`)
    .nullable(),
);

const manualFields = {
  bookingDate: z.iso.date({ error: 'Booking date must be a date (YYYY-MM-DD)' }),
  amountMinor: z
    .number({ error: 'Amount is required' })
    .int('Amount must be in minor units')
    .refine((value) => value !== 0, 'Amount must not be zero')
    .refine((value) => Number.isSafeInteger(value), 'Amount is too large'),
  description: z
    .string({ error: 'Description is required' })
    .trim()
    .min(1, 'Description is required')
    .max(MAX_TEXT_LENGTH, `Description must be at most ${MAX_TEXT_LENGTH} characters`),
  counterpartyName: optionalText,
};

const manualTransactionInput = z.object(manualFields);
const createManualTransactionInput = z.object({
  accountId: z.uuid({ error: 'Account is required' }),
  ...manualFields,
});

/** The fields of a Manual transaction the user types. Amount: signed minor units. */
export interface ManualTransactionInput {
  bookingDate: string;
  amountMinor: number;
  description: string;
  counterpartyName?: string | null;
}

export interface CreateManualTransactionInput extends ManualTransactionInput {
  accountId: string;
}

const TRANSACTION_NOT_FOUND = 'Transaction not found';
const uuid = z.uuid();

async function findTransaction(db: Queryable, id: string, lock = false): Promise<Transaction> {
  if (!uuid.safeParse(id).success) throw new NotFoundError(TRANSACTION_NOT_FOUND);
  const result = await db.query<Transaction>(
    `${SELECT_TRANSACTION} WHERE t.id = $1${lock ? ' FOR UPDATE OF t' : ''}`,
    [id],
  );
  const transaction = result.rows[0];
  if (!transaction) throw new NotFoundError(TRANSACTION_NOT_FOUND);
  return transaction;
}

interface OpenAccount {
  currency: string;
  openingDate: string | null;
}

/** Locks the Account (so balances stay consistent) and returns its Currency and opening date. */
async function lockOpenAccount(db: Queryable, accountId: string): Promise<OpenAccount> {
  const result = await db.query<OpenAccount & { archived: boolean }>(
    `SELECT currency, opening_date AS "openingDate", archived_at IS NOT NULL AS archived
     FROM account WHERE id = $1 FOR UPDATE`,
    [accountId],
  );
  const account = result.rows[0];
  if (!account) throw new NotFoundError('Account not found');
  if (account.archived) {
    throw new ConflictError('This Account is archived: Transactions can no longer be added');
  }
  return { currency: account.currency, openingDate: account.openingDate };
}

/**
 * The opening balance is the balance at the start of the opening date, so it already includes
 * everything booked before it (for example when an Import derived it). A Manual transaction
 * dated earlier would count twice: the user must first move the opening date and balance back.
 */
function refuseBeforeOpening(account: OpenAccount, bookingDate: string): void {
  if (account.openingDate && bookingDate < account.openingDate) {
    throw new ValidationError(
      `This Account's opening balance is dated ${account.openingDate} and already includes everything before. To record earlier history, first set an earlier opening date and balance on the Account page`,
    );
  }
}

/**
 * Classification Rules run when a Manual transaction is saved (spec 41, 78), inside the save's
 * mutation: their changes join the save's Batch, each recorded with its Rule as the actor.
 * Locked fields are left alone.
 */
async function runRulesOnSave(
  scope: MutationScope,
  transaction: Transaction,
): Promise<Transaction> {
  await runRulesOnTransaction(scope, transaction);
  return transaction;
}

/** Records a Manual transaction on an Account, in the Account's Currency. */
export async function createManualTransaction(
  ctx: ServiceContext,
  input: CreateManualTransactionInput,
): Promise<Transaction> {
  const values = parseInput(createManualTransactionInput, input);
  return mutate(ctx, async (scope) => {
    const { tx, history } = scope;
    const account = await lockOpenAccount(tx, values.accountId);
    refuseBeforeOpening(account, values.bookingDate);
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency,
         raw_description, counterparty_name)
       VALUES ($1, true, $2, $3, $4, $5, $6) RETURNING id`,
      [
        values.accountId,
        values.bookingDate,
        values.amountMinor,
        account.currency,
        values.description,
        values.counterpartyName,
      ],
    );
    const created = await findTransaction(tx, inserted.rows[0]!.id);
    await history.record('transaction', created.id, null, transactionSnapshot(created));
    return runRulesOnSave(scope, created);
  });
}

const NOT_MANUAL = 'This Transaction was imported, not entered by hand';

/** Replaces the typed fields of a Manual transaction. */
export async function updateManualTransaction(
  ctx: ServiceContext,
  id: string,
  input: ManualTransactionInput,
): Promise<Transaction> {
  const values = parseInput(manualTransactionInput, input);
  return mutate(ctx, async (scope) => {
    const { tx, history } = scope;
    const before = await findTransaction(tx, id, true);
    refuseBankFieldChanges(before, {
      bookingDate: values.bookingDate,
      amountMinor: values.amountMinor,
      rawDescription: values.description,
      counterpartyName: values.counterpartyName,
    });
    if (!before.isManual) throw new ValidationError(NOT_MANUAL);
    if (before.transferId && Math.sign(values.amountMinor) !== Math.sign(before.amountMinor)) {
      throw new ValidationError(
        'This Transaction is part of a Transfer. Unlink the Transfer before changing its sign',
      );
    }
    if (values.amountMinor !== before.amountMinor && (await splitAmong(tx, [id])).size > 0) {
      throw new ValidationError(
        'This Transaction is split: remove the Split before changing its amount',
      );
    }
    refuseBeforeOpening(await lockOpenAccount(tx, before.accountId), values.bookingDate);
    await tx.query(
      `UPDATE "transaction"
       SET booking_date = $1, amount_minor = $2, raw_description = $3, counterparty_name = $4
       WHERE id = $5`,
      [values.bookingDate, values.amountMinor, values.description, values.counterpartyName, id],
    );
    const after = await findTransaction(tx, id);
    await history.record(
      'transaction',
      id,
      transactionSnapshot(before),
      transactionSnapshot(after),
    );
    return runRulesOnSave(scope, after);
  });
}

/** Deletes a Manual transaction. Its History stays. */
export async function deleteManualTransaction(ctx: ServiceContext, id: string): Promise<void> {
  await mutate(ctx, async ({ tx, history }) => {
    const before = await findTransaction(tx, id, true);
    if (!before.isManual) {
      throw new ValidationError(`${NOT_MANUAL}: delete it from its Import instead`);
    }
    await lockOpenAccount(tx, before.accountId);
    await unlinkTransfers({ tx, history }, [id]);
    const snapshots = await deletionSnapshots(tx, [await findTransaction(tx, id)]);
    await tx.query('DELETE FROM "transaction" WHERE id = $1', [id]);
    await history.record('transaction', id, snapshots.get(id)!, null);
  });
}

/** One Manual transaction (for its edit form). Imported ones are not found here. */
export async function getManualTransaction(ctx: ServiceContext, id: string): Promise<Transaction> {
  const transaction = await findTransaction(ctx.db, id);
  if (!transaction.isManual) throw new NotFoundError(TRANSACTION_NOT_FOUND);
  return transaction;
}

/** An Account's Manual transactions, by booking date, then in the order they were entered. */
export async function listManualTransactions(
  ctx: ServiceContext,
  accountId: string,
): Promise<Transaction[]> {
  if (!uuid.safeParse(accountId).success) return [];
  const result = await ctx.db.query<Transaction>(
    `${SELECT_TRANSACTION} WHERE t.account_id = $1 AND t.is_manual ORDER BY ${TRANSACTION_ORDER}`,
    [accountId],
  );
  return result.rows;
}
