import { mutate, type ServiceContext } from '../context';
import { ConflictError, parseInput, ValidationError } from '../errors';
import { refuseIfRulesUse, retargetRules } from '../rules/references';
import { recordClassificationChanges } from '../transactions/classification';
import {
  findPayee,
  insertPayee,
  payeeName,
  SELECT_PAYEE,
  uniquePayeeName,
  type Payee,
} from './model';

export type { Payee } from './model';

/** What a merge did: how many Transactions moved, and its Batch. */
export interface MergeResult {
  transactionCount: number;
  batchId: string;
}

/** Every Payee, by name. */
export async function listPayees(ctx: ServiceContext): Promise<Payee[]> {
  const result = await ctx.db.query<Payee>(`${SELECT_PAYEE} ORDER BY lower(p.name), p.id`);
  return result.rows;
}

/** How many Transactions have a Payee, themselves or on a Split line; each counted once. */
export async function countTransactionsWithPayee(ctx: ServiceContext): Promise<number> {
  const result = await ctx.db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM (
       SELECT id FROM "transaction" WHERE payee_id IS NOT NULL
       UNION
       SELECT transaction_id FROM split_line WHERE payee_id IS NOT NULL) used`,
  );
  return result.rows[0]!.count;
}

export async function getPayee(ctx: ServiceContext, id: string): Promise<Payee> {
  return findPayee(ctx.db, id);
}

export async function createPayee(ctx: ServiceContext, name: string): Promise<Payee> {
  const value = parseInput(payeeName, name);
  return mutate(ctx, (scope) => insertPayee(scope, value));
}

/** Renames a Payee; every Transaction with it follows (spec 46). */
export async function renamePayee(ctx: ServiceContext, id: string, name: string): Promise<Payee> {
  const value = parseInput(payeeName, name);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findPayee(tx, id, true);
    await uniquePayeeName(value, () =>
      tx.query('UPDATE payee SET name = $1 WHERE id = $2', [value, id]),
    );
    const after = await findPayee(tx, id);
    await history.record('payee', id, { name: before.name }, { name: after.name });
    return after;
  });
}

/**
 * Merges `sourceId` into `targetId` (spec 47): its Transactions and Split lines take the target
 * and the source is deleted, all in one Batch with a readable summary. Locked fields stay locked.
 */
export async function mergePayees(
  ctx: ServiceContext,
  sourceId: string,
  targetId: string,
): Promise<MergeResult> {
  if (sourceId === targetId) throw new ValidationError("A Payee can't be merged into itself");
  return mutate(ctx, async (scope) => {
    const { tx, history } = scope;
    const source = await findPayee(tx, sourceId, true);
    const target = await findPayee(tx, targetId, true);
    // Transactions with the source, themselves or on a Split line (ADR-0006).
    const ids = await tx.query<{ id: string }>(
      `SELECT id FROM "transaction" WHERE payee_id = $1
       UNION SELECT transaction_id FROM split_line WHERE payee_id = $1`,
      [sourceId],
    );
    const transactionIds = ids.rows.map((row) => row.id);
    await recordClassificationChanges(scope, transactionIds, async () => {
      await tx.query('UPDATE "transaction" SET payee_id = $1 WHERE payee_id = $2', [
        targetId,
        sourceId,
      ]);
      await tx.query('UPDATE split_line SET payee_id = $1 WHERE payee_id = $2', [
        targetId,
        sourceId,
      ]);
    });
    await retargetRules(scope, 'payee', sourceId, targetId);
    await tx.query('DELETE FROM payee WHERE id = $1', [sourceId]);
    await history.record('payee', sourceId, { name: source.name }, null);
    await history.summarize(
      `Merged Payee "${source.name}" into "${target.name}" (${transactionIds.length} Transactions)`,
    );
    return { transactionCount: transactionIds.length, batchId: history.batchId };
  });
}

/** Deletes a Payee no Transaction or Split line uses; merge it into another to empty it. */
export async function deletePayee(ctx: ServiceContext, id: string): Promise<void> {
  await mutate(ctx, async ({ tx, history }) => {
    const payee = await findPayee(tx, id, true);
    if (payee.transactionCount > 0) {
      throw new ConflictError(
        `"${payee.name}" still has ${payee.transactionCount} Transactions: merge it into another Payee instead`,
      );
    }
    await refuseIfRulesUse(tx, 'payee', id, payee.name);
    await tx.query('DELETE FROM payee WHERE id = $1', [id]);
    await history.record('payee', id, { name: payee.name }, null);
  });
}
