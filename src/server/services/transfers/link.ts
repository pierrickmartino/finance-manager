import type { Queryable } from '@/server/db/client';
import type { MutationScope } from '../context';
import { NotFoundError, ValidationError } from '../errors';
import { recordClassificationChanges } from '../transactions/classification';
import { SELECT_TRANSACTION, transactionSnapshot, type Transaction } from '../transactions/model';
import { anySplit } from '../transactions/split-guard';
import { sameSide, sideLabel, sortSides, type TransferSideRef } from './sides';

/**
 * Linking and unlinking inside an open mutation, shared by the Transfers operations, Import
 * commit, Import undo and Transaction deletes. Every change is recorded in the scope's Batch:
 * the Transfer itself (entity `transfer`, with its sides and their kinds), `transferId` on a
 * whole Transaction side, and, for a Split line side, the line's Transfer and Category on its
 * Transaction's classification.
 */

export interface Transfer {
  id: string;
  createdAt: Date;
  /** The two sides, sorted by kind, then id. */
  sides: TransferSideRef[];
}

type Scope = Pick<MutationScope, 'tx' | 'history'>;

const transferSnapshot = (sides: readonly TransferSideRef[]) => ({
  sides: sortSides(sides).map(({ kind, id }) => ({ kind, id })),
});

/** A side locked for linking, with what the pairing rules check. */
interface LockedSide extends TransferSideRef {
  /** The Transaction, or the Split line's Transaction. */
  transaction: Transaction;
  amountMinor: number;
  transferId: string | null;
}

interface LineRow {
  id: string;
  transactionId: string;
  amountMinor: number;
  transferId: string | null;
}

const SELECT_LINE = `SELECT id, transaction_id AS "transactionId", amount_minor AS "amountMinor",
  transfer_id AS "transferId" FROM split_line`;

async function lockTransactions(tx: Queryable, ids: readonly string[]): Promise<Transaction[]> {
  const result = await tx.query<Transaction>(
    `${SELECT_TRANSACTION} WHERE t.id = ANY($1::uuid[]) ORDER BY t.id FOR UPDATE`,
    [ids],
  );
  return result.rows;
}

/**
 * Locks the sides, Transactions first (a Split line's with it), then the Split lines. A side
 * that doesn't exist is left out.
 */
async function lockSides(tx: Queryable, refs: readonly TransferSideRef[]): Promise<LockedSide[]> {
  const idsOf = (kind: TransferSideRef['kind']) =>
    refs.filter((ref) => ref.kind === kind).map((ref) => ref.id);
  const lineIds = idsOf('splitLine');
  const parents = await tx.query<{ transactionId: string }>(
    'SELECT transaction_id AS "transactionId" FROM split_line WHERE id = ANY($1::uuid[])',
    [lineIds],
  );
  const transactions = await lockTransactions(tx, [
    ...idsOf('transaction'),
    ...parents.rows.map((row) => row.transactionId),
  ]);
  const lines = await tx.query<LineRow>(
    `${SELECT_LINE} WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [lineIds],
  );
  const transactionById = new Map(transactions.map((row) => [row.id, row]));
  const lineById = new Map(lines.rows.map((row) => [row.id, row]));
  return refs.flatMap((ref): LockedSide[] => {
    if (ref.kind === 'transaction') {
      const transaction = transactionById.get(ref.id);
      if (!transaction) return [];
      const { amountMinor, transferId } = transaction;
      return [{ ...ref, transaction, amountMinor, transferId }];
    }
    const line = lineById.get(ref.id);
    const transaction = line && transactionById.get(line.transactionId);
    if (!line || !transaction) return [];
    return [{ ...ref, transaction, amountMinor: line.amountMinor, transferId: line.transferId }];
  });
}

/**
 * Refuses a pair that can't be a Transfer: two different sides, on different Accounts, with
 * opposite signs, neither in a Transfer yet. Amounts are not checked.
 */
function checkPair(sides: readonly LockedSide[], refs: readonly TransferSideRef[]): void {
  if (refs.length !== 2 || sameSide(refs[0]!, refs[1]!)) {
    throw new ValidationError('Choose two different sides for the Transfer');
  }
  const missing = refs.find((ref) => !sides.some((side) => sameSide(side, ref)));
  if (missing) throw new NotFoundError(`${sideLabel(missing.kind)} not found`);
  const [a, b] = sides as [LockedSide, LockedSide];
  if (a.transaction.accountId === b.transaction.accountId) {
    throw new ValidationError('The two sides of a Transfer must be on different Accounts');
  }
  if (Math.sign(a.amountMinor) * Math.sign(b.amountMinor) !== -1) {
    throw new ValidationError('The two sides of a Transfer must have opposite signs');
  }
  const linked = sides.find((side) => side.transferId !== null);
  if (linked) {
    throw new ValidationError(`This ${sideLabel(linked.kind)} is already part of a Transfer`);
  }
}

/**
 * Links two sides, each a whole Transaction or a Split line, as a Transfer. A split Transaction
 * can't be a side as a whole: only its lines can. Transfers carry no Category, so linking clears
 * it on both sides (classification and Rules then refuse to set one while the link holds).
 */
export async function linkPair(
  scope: MutationScope,
  refs: readonly TransferSideRef[],
): Promise<Transfer> {
  const { tx, history } = scope;
  const sides = await lockSides(tx, refs);
  checkPair(sides, refs);
  const wholes = sides.filter((side) => side.kind === 'transaction');
  const wholeIds = wholes.map((side) => side.id);
  const lineIds = sides.filter((side) => side.kind === 'splitLine').map((side) => side.id);
  if (await anySplit(tx, wholeIds)) {
    throw new ValidationError(
      'This Transaction is split: link one of its Split lines, or remove the Split, to make it a Transfer',
    );
  }
  const created = await tx.query<{ id: string; createdAt: Date }>(
    `INSERT INTO transfer DEFAULT VALUES RETURNING id, created_at AS "createdAt"`,
  );
  const { id, createdAt } = created.rows[0]!;
  const classified = [...new Set(sides.map((side) => side.transaction.id))];
  await recordClassificationChanges(scope, classified, async () => {
    await tx.query(
      `UPDATE "transaction" SET category_id = NULL
       WHERE id = ANY($1::uuid[]) AND category_id IS NOT NULL`,
      [wholeIds],
    );
    await tx.query(
      'UPDATE split_line SET category_id = NULL, transfer_id = $1 WHERE id = ANY($2::uuid[])',
      [id, lineIds],
    );
  });
  await tx.query('UPDATE "transaction" SET transfer_id = $1 WHERE id = ANY($2::uuid[])', [
    id,
    wholeIds,
  ]);
  const linked = sortSides(sides.map(({ kind, id: sideId }) => ({ kind, id: sideId })));
  await history.record('transfer', id, null, transferSnapshot(linked));
  for (const { transaction } of wholes) {
    await history.record(
      'transaction',
      transaction.id,
      transactionSnapshot(transaction),
      transactionSnapshot({ ...transaction, transferId: id }),
    );
  }
  return { id, createdAt, sides: linked };
}

/**
 * Unlinks these Transfers: every side loses the link and the Transfer is deleted. A whole
 * Transaction side keeps no Category; a Split line side is left with neither a Category nor a
 * Transfer (ADR-0005).
 */
export async function unlinkTransferIds(
  scope: Scope,
  transferIds: readonly string[],
): Promise<void> {
  const { tx, history } = scope;
  if (transferIds.length === 0) return;
  const wholes = await tx.query<Transaction>(
    `${SELECT_TRANSACTION} WHERE t.transfer_id = ANY($1::uuid[]) ORDER BY t.id FOR UPDATE`,
    [transferIds],
  );
  const lines = await tx.query<LineRow>(`${SELECT_LINE} WHERE transfer_id = ANY($1::uuid[])`, [
    transferIds,
  ]);
  const lineParents = [...new Set(lines.rows.map((line) => line.transactionId))];
  await recordClassificationChanges(scope, lineParents, () =>
    tx.query('UPDATE split_line SET transfer_id = NULL WHERE transfer_id = ANY($1::uuid[])', [
      transferIds,
    ]),
  );
  await tx.query('UPDATE "transaction" SET transfer_id = NULL WHERE id = ANY($1::uuid[])', [
    wholes.rows.map((side) => side.id),
  ]);
  const found = await tx.query<{ id: string }>(
    'DELETE FROM transfer WHERE id = ANY($1::uuid[]) RETURNING id',
    [transferIds],
  );
  for (const side of wholes.rows) {
    await history.record(
      'transaction',
      side.id,
      transactionSnapshot(side),
      transactionSnapshot({ ...side, transferId: null }),
    );
  }
  for (const { id: transferId } of found.rows) {
    const sides: TransferSideRef[] = [
      ...wholes.rows
        .filter((side) => side.transferId === transferId)
        .map((side) => ({ kind: 'transaction' as const, id: side.id })),
      ...lines.rows
        .filter((line) => line.transferId === transferId)
        .map((line) => ({ kind: 'splitLine' as const, id: line.id })),
    ];
    await history.record('transfer', transferId, transferSnapshot(sides), null);
  }
}

/**
 * Unlinks the Transfer this side, a whole Transaction or a Split line, is in; both sides stay,
 * unlinked. Refuses a side that doesn't exist or isn't in a Transfer.
 */
export async function unlinkSide(scope: Scope, ref: TransferSideRef): Promise<void> {
  const [side] = await lockSides(scope.tx, [ref]);
  if (!side) throw new NotFoundError(`${sideLabel(ref.kind)} not found`);
  if (!side.transferId) {
    throw new ValidationError(`This ${sideLabel(ref.kind)} is not part of a Transfer`);
  }
  await unlinkTransferIds(scope, [side.transferId]);
}

/**
 * Unlinks every Transfer the given Transactions, or their Split lines, are a side of. Import
 * undo and Transaction deletes call it before deleting, so the other side stays, unlinked.
 */
export async function unlinkTransfers(
  scope: Scope,
  transactionIds: readonly string[],
): Promise<void> {
  if (transactionIds.length === 0) return;
  const held = await scope.tx.query<{ transferId: string }>(
    `SELECT transfer_id AS "transferId" FROM "transaction"
     WHERE id = ANY($1::uuid[]) AND transfer_id IS NOT NULL
     UNION
     SELECT transfer_id FROM split_line
     WHERE transaction_id = ANY($1::uuid[]) AND transfer_id IS NOT NULL`,
    [transactionIds],
  );
  await unlinkTransferIds(
    scope,
    held.rows.map((row) => row.transferId),
  );
}
