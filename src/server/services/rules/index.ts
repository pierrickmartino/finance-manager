import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { findCategory } from '../categories/model';
import { mutate, type MutationScope, type ServiceContext } from '../context';
import { NotFoundError, parseInput, ValidationError } from '../errors';
import { findPayee } from '../payees/model';
import { findTag } from '../tags/model';
import { ruleInput, type ParsedRuleInput, type RuleInput } from './input';
import { findRule, loadRules, ruleSnapshot, type Rule } from './model';

/**
 * Managing Rules (spec 69-82): create, edit, enable or disable, reorder, delete. Rules run on
 * import and when a Manual transaction is saved (`./apply.ts`), and on existing Transactions
 * only when asked (`./existing.ts`), so none of these operations touches a Transaction
 * (spec 78).
 */

export type { Rule } from './model';
export type { RuleInput } from './input';
export type { NamedRuleAssignment, RuleClassification } from './apply';
export {
  applyRulesToExisting,
  countRuleMatches,
  MAX_PREVIEW_ROWS,
  previewApplyRules,
  suggestRuleFromTransaction,
  type ApplyRulesInput,
  type ApplyRulesPreview,
  type ApplyRulesResult,
  type RuleFieldChange,
  type TransactionRuleChange,
} from './existing';
export type {
  AmountOperator,
  DateOperator,
  Direction,
  RuleActions,
  RuleCondition,
  TextField,
  TextOperator,
} from './evaluator';
export {
  AMOUNT_OPERATORS,
  DATE_OPERATORS,
  DIRECTIONS,
  TEXT_FIELDS,
  TEXT_OPERATORS,
  validateRegex,
} from './evaluator';

export async function listRules(ctx: ServiceContext): Promise<Rule[]> {
  return loadRules(ctx.db);
}

export async function getRule(ctx: ServiceContext, id: string): Promise<Rule> {
  return findRule(ctx.db, id);
}

/** Every Account, Payee, Category and Tag the Rule names must exist. */
async function checkReferences(db: Queryable, input: ParsedRuleInput): Promise<void> {
  const { payeeId, categoryId, tagIds } = input.actions;
  if (payeeId) await findPayee(db, payeeId);
  if (categoryId) await findCategory(db, categoryId);
  for (const tagId of tagIds) await findTag(db, tagId);
  const accountIds = input.conditions.flatMap((c) => (c.type === 'account' ? c.accountIds : []));
  if (accountIds.length === 0) return;
  const found = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM account WHERE id = ANY($1::uuid[])',
    [[...new Set(accountIds)]],
  );
  if (found.rows[0]!.count !== new Set(accountIds).size) {
    throw new NotFoundError('Account not found');
  }
}

async function parseRule(db: Queryable, input: RuleInput): Promise<ParsedRuleInput> {
  const values = parseInput(ruleInput, input);
  await checkReferences(db, values);
  return values;
}

/** Adds a Rule at the end of the run order. */
export async function createRule(ctx: ServiceContext, input: RuleInput): Promise<Rule> {
  return mutate(ctx, async ({ tx, history }) => {
    const values = await parseRule(tx, input);
    await tx.query('LOCK TABLE rule IN SHARE ROW EXCLUSIVE MODE');
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO rule (name, sort, enabled, conditions, actions)
       VALUES ($1, (SELECT coalesce(max(sort) + 1, 0) FROM rule), $2, $3, $4) RETURNING id`,
      [
        values.name,
        values.enabled,
        JSON.stringify(values.conditions),
        JSON.stringify(values.actions),
      ],
    );
    const created = await findRule(tx, inserted.rows[0]!.id);
    await history.record('rule', created.id, null, ruleSnapshot(created));
    return created;
  });
}

/**
 * Replaces a Rule's name, conditions, actions and enabled state. Past Transactions keep the
 * classification they have (spec 78).
 */
export async function updateRule(ctx: ServiceContext, id: string, input: RuleInput): Promise<Rule> {
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findRule(tx, id, true);
    const values = await parseRule(tx, { ...input, enabled: input.enabled ?? before.enabled });
    await tx.query(
      'UPDATE rule SET name = $1, enabled = $2, conditions = $3, actions = $4 WHERE id = $5',
      [
        values.name,
        values.enabled,
        JSON.stringify(values.conditions),
        JSON.stringify(values.actions),
        id,
      ],
    );
    const after = await findRule(tx, id);
    await history.record('rule', id, ruleSnapshot(before), ruleSnapshot(after));
    return after;
  });
}

/** Turns a Rule on or off without deleting it (spec 82). */
export async function setRuleEnabled(
  ctx: ServiceContext,
  id: string,
  enabled: boolean,
): Promise<Rule> {
  const value = parseInput(z.boolean({ error: 'Enabled must be true or false' }), enabled);
  return mutate(ctx, async ({ tx, history }) => {
    const before = await findRule(tx, id, true);
    await tx.query('UPDATE rule SET enabled = $1 WHERE id = $2', [value, id]);
    const after = await findRule(tx, id);
    await history.record('rule', id, ruleSnapshot(before), ruleSnapshot(after));
    return after;
  });
}

const idList = z.array(z.string(), { error: 'Give the new order as a list of ids' });

/** Puts the Rules in the given run order (spec 75). `ids` must list every Rule once. */
export async function reorderRules(ctx: ServiceContext, ids: readonly string[]): Promise<Rule[]> {
  const order = parseInput(idList, ids);
  return mutate(ctx, async ({ tx, history }) => {
    await tx.query('LOCK TABLE rule IN SHARE ROW EXCLUSIVE MODE');
    const before = await loadRules(tx);
    const wanted = new Set(order);
    const isComplete =
      wanted.size === order.length &&
      order.length === before.length &&
      before.every((rule) => wanted.has(rule.id));
    if (!isComplete) throw new ValidationError('The new order must list every Rule exactly once');
    await tx.query(
      `UPDATE rule SET sort = o.n - 1
       FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, n) WHERE rule.id = o.id`,
      [order],
    );
    const after = await loadRules(tx);
    const sortOf = new Map(after.map((rule) => [rule.id, rule.sort]));
    for (const rule of before) {
      await history.record('rule', rule.id, { sort: rule.sort }, { sort: sortOf.get(rule.id) });
    }
    return after;
  });
}

/** Deletes a Rule. Transactions it classified keep their classification. */
export async function deleteRule(ctx: ServiceContext, id: string): Promise<void> {
  await mutate(ctx, async ({ tx, history }: MutationScope) => {
    const rule = await findRule(tx, id, true);
    await tx.query('DELETE FROM rule WHERE id = $1', [id]);
    await history.record('rule', id, ruleSnapshot(rule), null);
  });
}
