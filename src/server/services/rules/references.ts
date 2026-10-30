import type { Queryable } from '@/server/db/client';
import type { MutationScope } from '../context';
import { ConflictError } from '../errors';
import type { RuleActions } from './evaluator';
import { RULE_ORDER, ruleSnapshot, SELECT_RULE, type Rule } from './model';

/**
 * Keeps Rule actions in step with Payees, Categories and Tags. Rule actions hold their ids in
 * JSON, which the database can't protect with foreign keys, so the merge and delete operations
 * of those entities call these helpers inside their own mutation (same Batch):
 * - a merge points every Rule at the merge target;
 * - deleting a Tag takes it off every Rule (deleting a Tag also takes it off Transactions);
 * - deleting a Payee or Category a Rule sets is refused, like deleting one still in use.
 */

export type RuleReferenceKind = 'payee' | 'category' | 'tag';

const usesSql: Record<RuleReferenceKind, string> = {
  payee: `r.actions->>'payeeId' = $1`,
  category: `r.actions->>'categoryId' = $1`,
  tag: `r.actions->'tagIds' ? $1`,
};

async function rulesUsing(
  db: Queryable,
  kind: RuleReferenceKind,
  id: string,
  lock = false,
): Promise<Rule[]> {
  const result = await db.query<Rule>(
    `${SELECT_RULE} WHERE ${usesSql[kind]} ORDER BY ${RULE_ORDER}${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return result.rows;
}

function replaceReference(
  actions: RuleActions,
  kind: RuleReferenceKind,
  sourceId: string,
  targetId: string | null,
): RuleActions {
  switch (kind) {
    case 'payee':
      return { ...actions, payeeId: targetId };
    case 'category':
      return { ...actions, categoryId: targetId };
    case 'tag': {
      const tagIds = actions.tagIds.flatMap((id) => (id === sourceId ? (targetId ?? []) : id));
      return { ...actions, tagIds: [...new Set(tagIds)] };
    }
  }
}

async function rewriteRules(
  scope: MutationScope,
  kind: RuleReferenceKind,
  sourceId: string,
  targetId: string | null,
): Promise<void> {
  for (const rule of await rulesUsing(scope.tx, kind, sourceId, true)) {
    const actions = replaceReference(rule.actions, kind, sourceId, targetId);
    await scope.tx.query('UPDATE rule SET actions = $1 WHERE id = $2', [
      JSON.stringify(actions),
      rule.id,
    ]);
    await scope.history.record(
      'rule',
      rule.id,
      ruleSnapshot(rule),
      ruleSnapshot({ ...rule, actions }),
    );
  }
}

/** After `sourceId` is merged into `targetId`: Rules that used the source use the target. */
export async function retargetRules(
  scope: MutationScope,
  kind: RuleReferenceKind,
  sourceId: string,
  targetId: string,
): Promise<void> {
  await rewriteRules(scope, kind, sourceId, targetId);
}

/** A deleted Tag is no longer added by any Rule. */
export async function removeTagFromRules(scope: MutationScope, tagId: string): Promise<void> {
  await rewriteRules(scope, 'tag', tagId, null);
}

/** Refuses to delete a Payee or Category that a Rule sets. */
export async function refuseIfRulesUse(
  db: Queryable,
  kind: 'payee' | 'category',
  id: string,
  name: string,
): Promise<void> {
  const [rule, ...others] = await rulesUsing(db, kind, id);
  if (!rule) return;
  const more = others.length > 0 ? ` and ${others.length} other Rules` : '';
  throw new ConflictError(
    `"${name}" is set by Rule "${rule.name}"${more}: change those Rules first, or merge it instead`,
  );
}
