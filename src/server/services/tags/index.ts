import { mutate, type MutationScope, type ServiceContext } from '../context';
import { parseInput, ValidationError } from '../errors';
import { removeTagFromRules, retargetRules } from '../rules/references';
import { recordClassificationChanges } from '../transactions/classification';
import { findTag, insertTag, SELECT_TAG, tagName, uniqueTagName, type Tag } from './model';

export type { Tag } from './model';
export { getTagActivity, type TagActivity, type TagCurrencyTotal } from './activity';

/** What a merge or delete did: how many Transactions it touched, and its Batch. */
export interface TagChangeResult {
  transactionCount: number;
  batchId: string;
}

/** Every Tag, by name. */
export async function listTags(ctx: ServiceContext): Promise<Tag[]> {
  const result = await ctx.db.query<Tag>(`${SELECT_TAG} ORDER BY lower(g.name), g.id`);
  return result.rows;
}

export async function createTag(ctx: ServiceContext, name: string): Promise<Tag> {
  const value = parseInput(tagName, name);
  return mutate(ctx, (scope) => insertTag(scope, value));
}

/** Renames a Tag; every Transaction carrying it follows. */
export async function renameTag(ctx: ServiceContext, id: string, name: string): Promise<Tag> {
  const value = parseInput(tagName, name);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findTag(tx, id, true);
    await uniqueTagName(value, () =>
      tx.query('UPDATE tag SET name = $1 WHERE id = $2', [value, id]),
    );
    const after = await findTag(tx, id);
    await history.record('tag', id, { name: before.name }, { name: after.name });
    return after;
  });
}

async function transactionsWithTag(scope: MutationScope, tagId: string): Promise<string[]> {
  const result = await scope.tx.query<{ id: string }>(
    'SELECT transaction_id AS id FROM transaction_tag WHERE tag_id = $1',
    [tagId],
  );
  return result.rows.map((row) => row.id);
}

/** Deletes the Tag row and records it, inside an open mutation. */
async function removeTag(scope: MutationScope, tag: Tag): Promise<void> {
  await scope.tx.query('DELETE FROM tag WHERE id = $1', [tag.id]);
  await scope.history.record('tag', tag.id, { name: tag.name }, null);
}

/**
 * Merges `sourceId` into `targetId`: every Transaction with the source gets the target instead
 * (once), and the source is deleted. One Batch, with a readable summary.
 */
export async function mergeTags(
  ctx: ServiceContext,
  sourceId: string,
  targetId: string,
): Promise<TagChangeResult> {
  if (sourceId === targetId) throw new ValidationError("A Tag can't be merged into itself");
  return mutate(ctx, async (scope) => {
    const source = await findTag(scope.tx, sourceId, true);
    const target = await findTag(scope.tx, targetId, true);
    const transactionIds = await transactionsWithTag(scope, sourceId);
    await recordClassificationChanges(scope, transactionIds, async () => {
      await scope.tx.query(
        `INSERT INTO transaction_tag (transaction_id, tag_id, source)
         SELECT transaction_id, $2, source FROM transaction_tag WHERE tag_id = $1
         ON CONFLICT (transaction_id, tag_id) DO NOTHING`,
        [sourceId, targetId],
      );
      await scope.tx.query('DELETE FROM transaction_tag WHERE tag_id = $1', [sourceId]);
    });
    await retargetRules(scope, 'tag', sourceId, targetId);
    await removeTag(scope, source);
    await scope.history.summarize(
      `Merged Tag "${source.name}" into "${target.name}" (${transactionIds.length} Transactions)`,
    );
    return { transactionCount: transactionIds.length, batchId: scope.history.batchId };
  });
}

/** Deletes a Tag, taking it off every Transaction (spec 59). One Batch. */
export async function deleteTag(ctx: ServiceContext, id: string): Promise<TagChangeResult> {
  return mutate(ctx, async (scope) => {
    const tag = await findTag(scope.tx, id, true);
    const transactionIds = await transactionsWithTag(scope, id);
    await recordClassificationChanges(scope, transactionIds, () =>
      scope.tx.query('DELETE FROM transaction_tag WHERE tag_id = $1', [id]),
    );
    await removeTagFromRules(scope, id);
    await removeTag(scope, tag);
    await scope.history.summarize(
      `Deleted Tag "${tag.name}" (${transactionIds.length} Transactions)`,
    );
    return { transactionCount: transactionIds.length, batchId: scope.history.batchId };
  });
}
