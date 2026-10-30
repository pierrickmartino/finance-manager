import type { Queryable } from '@/server/db/client';
import { getOpeningBalance, hasTransactions, setOpeningBalance } from '../accounts';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { NotFoundError, ValidationError } from '../errors';
import { SELECT_TRANSACTION, TRANSACTION_ORDER, transactionSnapshot } from '../transactions/model';
import type { Transaction } from '../transactions/model';
import { findImport, id, importSnapshot, type Import, type OpeningChange } from './model';
import { unlinkTransfers } from './transfer-unlink';

type Scope = Pick<MutationScope, 'tx' | 'history'>;

async function lockAccount(tx: Queryable, accountId: string): Promise<void> {
  await tx.query('SELECT 1 FROM account WHERE id = $1 FOR UPDATE', [accountId]);
}

/**
 * Deletes imported Transactions in the current mutation: unlinks their Transfers first, then
 * records each deletion in History.
 */
async function deleteTransactions(scope: Scope, transactions: readonly Transaction[]) {
  if (transactions.length === 0) return;
  await unlinkTransfers(
    scope,
    transactions.map((transaction) => transaction.id),
  );
  await scope.tx.query('DELETE FROM "transaction" WHERE id = ANY($1::uuid[])', [
    transactions.map((transaction) => transaction.id),
  ]);
  for (const transaction of transactions) {
    await scope.history.record(
      'transaction',
      transaction.id,
      transactionSnapshot(transaction),
      null,
    );
  }
}

async function readOpeningChange(tx: Queryable, importId: string): Promise<OpeningChange | null> {
  const result = await tx.query<{ openingChange: OpeningChange | null }>(
    'SELECT opening_change AS "openingChange" FROM import WHERE id = $1',
    [importId],
  );
  return result.rows[0]?.openingChange ?? null;
}

/**
 * Puts back the opening balance the Import replaced, when no Transaction is left on the
 * Account (the Account is as it was before its first Import) and the opening balance is still
 * the one the Import set. Otherwise the remaining Transactions rely on it, so it stays.
 */
async function restoreOpeningBalance(scope: Scope, undone: Import): Promise<void> {
  const change = await readOpeningChange(scope.tx, undone.id);
  if (!change || (await hasTransactions(scope.tx, undone.accountId))) return;
  const current = await getOpeningBalance(scope.tx, undone.accountId);
  if (current.amountMinor !== change.after.amountMinor || current.date !== change.after.date) {
    return;
  }
  await setOpeningBalance(scope, undone.accountId, change.before);
}

/**
 * Undoes an Import (spec 33): deletes all of its Transactions, unlinks the Transfers they belong
 * to, restores the opening balance it set when nothing else relies on it, and marks it undone,
 * all in one History Batch. Its file can be imported again afterwards.
 */
export async function undoImport(ctx: ServiceContext, importId: string): Promise<Import> {
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findImport(tx, importId, true);
    if (before.undoneAt) throw new ValidationError('This Import has already been undone');
    await lockAccount(tx, before.accountId);
    const transactions = await tx.query<Transaction>(
      `${SELECT_TRANSACTION} WHERE t.import_id = $1 ORDER BY ${TRANSACTION_ORDER}`,
      [importId],
    );
    await deleteTransactions({ tx, history }, transactions.rows);
    await restoreOpeningBalance({ tx, history }, before);
    await tx.query('UPDATE import SET undone_at = now() WHERE id = $1', [importId]);
    const after = await findImport(tx, importId);
    await history.record('import', importId, importSnapshot(before), importSnapshot(after));
    return after;
  });
}

/**
 * Deletes one imported Transaction (spec 34), for a bank error, without undoing its Import.
 * Recorded in History. Manual transactions are deleted with the Transactions operations.
 */
export async function deleteImportedTransaction(
  ctx: ServiceContext,
  transactionId: string,
): Promise<void> {
  if (!id.safeParse(transactionId).success) throw new NotFoundError('Transaction not found');
  await mutate(ctx, async ({ tx, history }) => {
    const result = await tx.query<Transaction>(`${SELECT_TRANSACTION} WHERE t.id = $1 FOR UPDATE`, [
      transactionId,
    ]);
    const transaction = result.rows[0];
    if (!transaction) throw new NotFoundError('Transaction not found');
    if (transaction.isManual) {
      throw new ValidationError('This is a Manual transaction, not an imported one');
    }
    await deleteTransactions({ tx, history }, [transaction]);
  });
}
