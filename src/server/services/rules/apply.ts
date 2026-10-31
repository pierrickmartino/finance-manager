import type { Queryable } from '@/server/db/client';
import type { Actor, MutationScope } from '../context';
import {
  applyClassification,
  loadClassifications,
  type Classification,
} from '../transactions/classification';
import type { Transaction } from '../transactions/model';
import {
  compileRules,
  evaluateRules,
  type CompiledRules,
  type RuleAssignment,
  type RuleEvaluation,
  type RuleSubject,
} from './evaluator';
import { loadRules, type Rule } from './model';

/**
 * Running the Rules against the database: load them once (`loadRuleEngine`), evaluate many
 * Transactions with the pure evaluator, name the result for a preview (`describeEvaluation`)
 * and write it (`applyRuleAssignments`).
 *
 * History: Rules run inside the action that triggered them (an Import commit, a Manual
 * transaction save), so their changes join that action's Batch. Each change is recorded with
 * the Rule that made it as the actor (`{ type: 'rule', id: ruleId }`), via `history.as(...)`.
 */

/** The Rules in run order, compiled, with the names a preview shows. */
export interface RuleEngine {
  readonly compiled: CompiledRules;
  readonly ruleNames: ReadonlyMap<string, string>;
  readonly payeeNames: ReadonlyMap<string, string>;
  /** "Group › Category". */
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly tagNames: ReadonlyMap<string, string>;
}

/** One assignment with the names to show it: the value's and the Rule's. */
export interface NamedRuleAssignment extends RuleAssignment {
  name: string;
  ruleName: string;
}

/** What the Rules give one Transaction, as the import preview shows it (spec 29). */
export interface RuleClassification {
  payee: NamedRuleAssignment | null;
  category: NamedRuleAssignment | null;
  tags: NamedRuleAssignment[];
}

async function namesById(db: Queryable, sql: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const result = await db.query<{ id: string; name: string }>(sql, [ids]);
  return new Map(result.rows.map((row) => [row.id, row.name]));
}

/**
 * Drops actions whose Payee, Category or Tag no longer exists. Merges and deletes keep Rules
 * in step (`./references.ts`); this is the backstop, so a Rule never writes a dangling id.
 */
function withExistingTargets(rule: Rule, engine: Omit<RuleEngine, 'compiled' | 'ruleNames'>): Rule {
  const { payeeId, categoryId, tagIds } = rule.actions;
  return {
    ...rule,
    actions: {
      payeeId: payeeId && engine.payeeNames.has(payeeId) ? payeeId : null,
      categoryId: categoryId && engine.categoryNames.has(categoryId) ? categoryId : null,
      tagIds: tagIds.filter((id) => engine.tagNames.has(id)),
    },
  };
}

/** Loads every Rule, in run order, with the names of what they set. */
export async function loadRuleEngine(db: Queryable): Promise<RuleEngine> {
  const rules = await loadRules(db);
  const actions = rules.map((rule) => rule.actions);
  const names = {
    payeeNames: await namesById(
      db,
      'SELECT id, name FROM payee WHERE id = ANY($1::uuid[])',
      actions.flatMap((a) => (a.payeeId ? [a.payeeId] : [])),
    ),
    categoryNames: await namesById(
      db,
      `SELECT c.id, g.name || ' › ' || c.name AS name
       FROM category c JOIN category_group g ON g.id = c.group_id WHERE c.id = ANY($1::uuid[])`,
      actions.flatMap((a) => (a.categoryId ? [a.categoryId] : [])),
    ),
    tagNames: await namesById(
      db,
      'SELECT id, name FROM tag WHERE id = ANY($1::uuid[])',
      actions.flatMap((a) => a.tagIds),
    ),
  };
  return {
    ...names,
    compiled: compileRules(
      rules.map((rule) => withExistingTargets(rule, names)),
      { payeeNames: names.payeeNames },
    ),
    ruleNames: new Map(rules.map((rule) => [rule.id, rule.name])),
  };
}

/** Names an evaluation's assignments for display. */
export function describeEvaluation(
  engine: RuleEngine,
  evaluation: RuleEvaluation,
): RuleClassification {
  const named = (
    assignment: RuleAssignment,
    names: ReadonlyMap<string, string>,
  ): NamedRuleAssignment => ({
    ...assignment,
    name: names.get(assignment.id) ?? '',
    ruleName: engine.ruleNames.get(assignment.ruleId) ?? '',
  });
  return {
    payee: evaluation.payee && named(evaluation.payee, engine.payeeNames),
    category: evaluation.category && named(evaluation.category, engine.categoryNames),
    tags: evaluation.tags.map((tag) => named(tag, engine.tagNames)),
  };
}

/** The Transaction as Rules see it. */
export function ruleSubject(
  transaction: Pick<
    Transaction,
    'accountId' | 'bookingDate' | 'amountMinor' | 'rawDescription' | 'counterpartyName'
  >,
  classification: Pick<Classification, 'payee' | 'lockedFields'> | null,
  inTransfer: boolean,
): RuleSubject {
  return {
    accountId: transaction.accountId,
    bookingDate: transaction.bookingDate,
    amountMinor: transaction.amountMinor,
    rawDescription: transaction.rawDescription,
    counterpartyName: transaction.counterpartyName,
    payee: classification?.payee ?? null,
    lockedFields: classification?.lockedFields ?? [],
    isInTransfer: inTransfer,
  };
}

type Assignments = Pick<RuleEvaluation, 'payee' | 'category' | 'tags'>;

/**
 * Writes what the Rules assigned to one Transaction, inside an open mutation: one
 * `applyClassification(..., { by: 'rule' })` per Rule, recorded with that Rule as the actor in
 * the scope's Batch. Locked fields are skipped there too.
 */
export async function applyRuleAssignments(
  scope: MutationScope,
  transactionId: string,
  assignments: Assignments,
): Promise<void> {
  const byRule = new Map<string, { payeeId?: string; categoryId?: string; tagIds?: string[] }>();
  const changesOf = (ruleId: string) => {
    const changes = byRule.get(ruleId) ?? {};
    byRule.set(ruleId, changes);
    return changes;
  };
  if (assignments.payee) changesOf(assignments.payee.ruleId).payeeId = assignments.payee.id;
  if (assignments.category) {
    changesOf(assignments.category.ruleId).categoryId = assignments.category.id;
  }
  for (const tag of assignments.tags) {
    const changes = changesOf(tag.ruleId);
    changes.tagIds = [...(changes.tagIds ?? []), tag.id];
  }
  for (const [ruleId, changes] of byRule) {
    const actor: Actor = { type: 'rule', id: ruleId };
    await applyClassification(
      { ...scope, actor, history: scope.history.as(actor) },
      transactionId,
      changes,
      { by: 'rule' },
    );
  }
}

/**
 * Runs the Rules on one saved Transaction inside an open mutation (a Manual transaction save,
 * spec 41) and writes the result. Returns the evaluation.
 */
export async function runRulesOnTransaction(
  scope: MutationScope,
  transaction: Transaction,
  engine?: RuleEngine,
): Promise<RuleEvaluation> {
  const rules = engine ?? (await loadRuleEngine(scope.tx));
  const [classification] = await loadClassifications(scope.tx, [transaction.id]);
  const subject = ruleSubject(transaction, classification ?? null, transaction.transferId !== null);
  const evaluation = evaluateRules(rules.compiled, subject);
  await applyRuleAssignments(scope, transaction.id, evaluation);
  return evaluation;
}
