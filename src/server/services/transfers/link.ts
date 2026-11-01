import type { Queryable } from '@/server/db/client';
import type { MutationScope } from '../context';
import { NotFoundError, ValidationError } from '../errors';
import { recordClassificationChanges } from '../transactions/classification';
import { SELECT_TRANSACTION, transactionSnapshot, type Transaction } from '../transactions/model';
import { anySplit } from '../transactions/split-guard';

/**
 * Linking and unlinking inside an open mutation, shared by the Transfers operations, Import
 * commit, Import undo and Transaction deletes. Every change is recorded in the scope's Batch:
 * the Transfer itself (entity `transfer`) and `transferId` on both Transactions.
 */

export interface Transfer {
  id: string;
  createdAt: Date;
  /** The two sides, sorted by id. */
  transactionIds: string[];
}

type Scope = Pick<MutationScope, 'tx' | 'history'>;

const transferSnapshot = (transactionIds: readonly string[]) => ({
  transactionIds: [...transactionIds].sort(),
});

async function lockTransactions(tx: Queryable, ids: readonly string[]): Promise<Transaction[]> {
  const result = await tx.query<Transaction>(
    `${SELECT_TRANSACTION} WHERE t.id = ANY($1::uuid[]) ORDER BY t.id FOR UPDATE`,
    [ids],
  );
  return result.rows;
}

/** Refuses a pair that can't be a Transfer: two sides on different Accounts, opposite signs. */
function checkPair(sides: readonly Transaction[], ids: readonly string[]): void {
  if (new Set(ids).size !== 2) throw new ValidationError('Choose two different Transactions');
  if (sides.length !== 2) throw new NotFoundError('Transaction not found');
  const [a, b] = sides as [Transaction, Transaction];
  if (a.accountId === b.accountId) {
    throw new ValidationError('The two sides of a Transfer must be on different Accounts');
  }
  if (Math.sign(a.amountMinor) * Math.sign(b.amountMinor) !== -1) {
    throw new ValidationError('The two sides of a Transfer must have opposite signs');
  }
  if (a.transferId || b.transferId) {
    throw new ValidationError('This Transaction is already part of a Transfer');
  }
}

/**
 * Links two Transactions as a Transfer. Transfers carry no Category, so linking clears it on
 * both sides (classification and Rules then refuse to set one while the link holds).
 */
export async function linkPair(scope: MutationScope, ids: readonly string[]): Promise<Transfer> {
  const { tx, history } = scope;
  const before = await lockTransactions(tx, ids);
  checkPair(before, ids);
  if (await anySplit(tx, ids)) {
    throw new ValidationError(
      'This Transaction is split: remove the Split before linking it as a Transfer',
    );
  }
  await recordClassificationChanges(scope, ids, () =>
    tx.query(
      `UPDATE "transaction" SET category_id = NULL
       WHERE id = ANY($1::uuid[]) AND category_id IS NOT NULL`,
      [ids],
    ),
  );
  const created = await tx.query<{ id: string; createdAt: Date }>(
    `INSERT INTO transfer DEFAULT VALUES RETURNING id, created_at AS "createdAt"`,
  );
  const { id, createdAt } = created.rows[0]!;
  await tx.query('UPDATE "transaction" SET transfer_id = $1 WHERE id = ANY($2::uuid[])', [id, ids]);
  const transactionIds = before.map((side) => side.id);
  await history.record('transfer', id, null, transferSnapshot(transactionIds));
  for (const side of before) {
    await history.record(
      'transaction',
      side.id,
      transactionSnapshot(side),
      transactionSnapshot({ ...side, transferId: id }),
    );
  }
  return { id, createdAt, transactionIds };
}

/**
 * Unlinks every Transfer the given Transactions belong to: both sides lose the link and the
 * Transfer is deleted. Import undo and Transaction deletes call it before deleting, so the
 * other side stays, unlinked.
 */
export async function unlinkTransfers(
  { tx, history }: Scope,
  transactionIds: readonly string[],
): Promise<void> {
  if (transactionIds.length === 0) return;
  const sides = await tx.query<Transaction>(
    `${SELECT_TRANSACTION}
     WHERE t.transfer_id IN (SELECT transfer_id FROM "transaction"
                             WHERE id = ANY($1::uuid[]) AND transfer_id IS NOT NULL)
     ORDER BY t.id FOR UPDATE`,
    [transactionIds],
  );
  if (sides.rows.length === 0) return;
  const transferIds = [...new Set(sides.rows.map((side) => side.transferId!))];
  await tx.query('UPDATE "transaction" SET transfer_id = NULL WHERE id = ANY($1::uuid[])', [
    sides.rows.map((side) => side.id),
  ]);
  await tx.query('DELETE FROM transfer WHERE id = ANY($1::uuid[])', [transferIds]);
  for (const side of sides.rows) {
    await history.record(
      'transaction',
      side.id,
      transactionSnapshot(side),
      transactionSnapshot({ ...side, transferId: null }),
    );
  }
  for (const transferId of transferIds) {
    const ids = sides.rows.filter((side) => side.transferId === transferId).map((side) => side.id);
    await history.record('transfer', transferId, transferSnapshot(ids), null);
  }
}
