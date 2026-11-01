import { categoryLabel } from '@/lib/classification';
import { mutate, type ServiceContext } from '../context';
import { ValidationError } from '../errors';
import { retargetRules } from '../rules/references';
import { recordClassificationChanges } from '../transactions/classification';
import { categorySnapshot, findCategory } from './model';

/** What a merge did: how many Transactions moved, and its Batch. */
export interface CategoryMergeResult {
  transactionCount: number;
  batchId: string;
}

/**
 * Merges `sourceId` into `targetId` (spec 56): its Transactions and Split lines take the target
 * Category, and the emptied source is deleted. One Batch with a readable summary. Locks are kept.
 */
export async function mergeCategory(
  ctx: ServiceContext,
  sourceId: string,
  targetId: string,
): Promise<CategoryMergeResult> {
  if (sourceId === targetId) throw new ValidationError("A Category can't be merged into itself");
  return mutate(ctx, async (scope) => {
    const { tx, history } = scope;
    const source = await findCategory(tx, sourceId, true);
    const target = await findCategory(tx, targetId, true);
    // Transactions in the source, directly or through a Split line (ADR-0004).
    const ids = await tx.query<{ id: string }>(
      `SELECT id FROM "transaction" WHERE category_id = $1
       UNION SELECT transaction_id FROM split_line WHERE category_id = $1`,
      [sourceId],
    );
    const transactionIds = ids.rows.map((row) => row.id);
    await recordClassificationChanges(scope, transactionIds, async () => {
      await tx.query('UPDATE "transaction" SET category_id = $1 WHERE category_id = $2', [
        targetId,
        sourceId,
      ]);
      await tx.query('UPDATE split_line SET category_id = $1 WHERE category_id = $2', [
        targetId,
        sourceId,
      ]);
    });
    await retargetRules(scope, 'category', sourceId, targetId);
    await tx.query('DELETE FROM category WHERE id = $1', [sourceId]);
    await history.record('category', sourceId, categorySnapshot(source), null);
    await history.summarize(
      `Merged Category "${categoryLabel(source)}" into "${categoryLabel(target)}" (${transactionIds.length} Transactions)`,
    );
    return { transactionCount: transactionIds.length, batchId: history.batchId };
  });
}
