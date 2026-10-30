import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { parseInput } from '../errors';
import { mutate, type Actor, type MutationScope, type ServiceContext } from '../context';
import {
  recordClassificationChanges,
  type ClassificationField,
} from '../transactions/classification';
import { filterConditions, transactionQueryInput } from '../transactions/query';
import { isInTransfer } from '../transactions/transfer-guard';
import { compileRules, evaluateRules, type RuleEvaluation } from './evaluator';
import { loadRuleEngine, type RuleEngine } from './apply';
import { findRule } from './model';

/**
 * Applying Rules to existing Transactions (spec: Rules are the main tool for reclassifying
 * history). `previewApplyRules` shows what would change and writes nothing;
 * `applyRulesToExisting` writes exactly that, as one History Batch. Both go through `plan`, so
 * the commit equals the preview when nothing changed in between.
 *
 * Same semantics as on import: Rules run in order, the first Rule setting a field wins, Tags
 * add up, locked fields are never written, and Transactions in a Transfer are skipped (the
 * `isInTransfer` guard).
 */

/** How many changed Transactions a preview lists (the counts cover all of them). */
export const MAX_PREVIEW_ROWS = 200;

const MAX_RULE_IDS = 500;

const filterInput = transactionQueryInput.optional();

const applyInput = z.object({
  /**
   * The Rules to apply, in run order. Absent: every enabled Rule. Rules chosen by id run even
   * when disabled: choosing a Rule is asking for it to run.
   */
  ruleIds: z
    .array(z.string())
    .min(1, 'Choose at least one Rule')
    .max(MAX_RULE_IDS, 'Too many Rules')
    .optional(),
  /** Which Transactions: the Transaction list's filters (page and page size are ignored). */
  filter: filterInput,
});

export type ApplyRulesInput = z.input<typeof applyInput>;
type ParsedInput = z.output<typeof applyInput>;

type AppliedField = Exclude<ClassificationField, 'notes'>;

/** One field a Rule changes: readable values ("Group › Category"; Tags joined by ", "). */
export interface RuleFieldChange {
  field: AppliedField;
  before: string | null;
  after: string | null;
  /** The Rule(s) that set it, joined by ", " (Tags can come from several). */
  ruleName: string;
}

export interface TransactionRuleChange {
  transactionId: string;
  bookingDate: string;
  accountName: string;
  rawDescription: string;
  amountMinor: number;
  currency: string;
  fields: RuleFieldChange[];
}

export interface ApplyRulesPreview {
  /** Transactions the Rules looked at (all those the filter selects). */
  examined: number;
  /** Transactions that would change. */
  changedCount: number;
  /** Transactions per field that would change. */
  fieldCounts: Record<AppliedField, number>;
  /** Transactions left alone because they are in a Transfer. */
  skippedTransfers: number;
  /** The first MAX_PREVIEW_ROWS changed Transactions, oldest first. */
  changes: TransactionRuleChange[];
}

interface Candidate {
  id: string;
  accountId: string;
  accountName: string;
  bookingDate: string;
  amountMinor: number;
  currency: string;
  rawDescription: string;
  counterpartyName: string | null;
  lockedFields: ClassificationField[];
  payeeId: string | null;
  payeeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  tagIds: string[];
  tagNames: string[];
}

/** What the Rules write on one Transaction: only assignments that change something. */
export interface PlannedChange {
  candidate: Candidate;
  payee: { id: string; ruleId: string } | null;
  category: { id: string; ruleId: string } | null;
  /** Tags not on the Transaction yet. */
  tags: { id: string; ruleId: string }[];
}

interface Plan {
  examined: number;
  skippedTransfers: number;
  changes: PlannedChange[];
  engine: RuleEngine;
}

const SELECT_CANDIDATES = `
  SELECT t.id, t.account_id AS "accountId", a.name AS "accountName",
         t.booking_date AS "bookingDate", t.amount_minor AS "amountMinor", t.currency,
         t.raw_description AS "rawDescription", t.counterparty_name AS "counterpartyName",
         t.locked_fields AS "lockedFields",
         t.payee_id AS "payeeId", p.name AS "payeeName",
         t.category_id AS "categoryId",
         CASE WHEN c.id IS NULL THEN NULL ELSE g.name || ' › ' || c.name END AS "categoryName",
         ARRAY(SELECT tt.tag_id::text FROM transaction_tag tt
               WHERE tt.transaction_id = t.id) AS "tagIds",
         ARRAY(SELECT tg.name FROM transaction_tag tt JOIN tag tg ON tg.id = tt.tag_id
               WHERE tt.transaction_id = t.id ORDER BY lower(tg.name), tg.id) AS "tagNames"
  FROM "transaction" t
  JOIN account a ON a.id = t.account_id
  LEFT JOIN payee p ON p.id = t.payee_id
  LEFT JOIN category c ON c.id = t.category_id
  LEFT JOIN category_group g ON g.id = c.group_id`;

async function loadCandidates(
  db: Queryable,
  filter: ParsedInput['filter'],
  lock: boolean,
): Promise<Candidate[]> {
  const { sql, params } = filter
    ? filterConditions(filter)
    : { sql: '', params: [] as unknown[] };
  const result = await db.query<Candidate>(
    `${SELECT_CANDIDATES} ${sql} ORDER BY t.booking_date, t.entry_order${lock ? ' FOR UPDATE OF t' : ''}`,
    params,
  );
  return result.rows;
}

/** The engine restricted to the chosen Rules (forced on), or every Rule as stored. */
async function engineFor(db: Queryable, ruleIds: string[] | undefined): Promise<RuleEngine> {
  const engine = await loadRuleEngine(db);
  if (!ruleIds) return engine;
  for (const id of ruleIds) await findRule(db, id);
  const chosen = new Set(ruleIds);
  return {
    ...engine,
    compiled: compileRules(
      engine.compiled.rules
        .map((rule) => rule.definition)
        .filter((rule) => chosen.has(rule.id))
        .map((rule) => ({ ...rule, enabled: true })),
      { payeeNames: engine.compiled.payeeNames },
    ),
  };
}

function plannedChange(candidate: Candidate, evaluation: RuleEvaluation): PlannedChange | null {
  const payee = evaluation.payee?.id !== candidate.payeeId ? evaluation.payee : null;
  const category = evaluation.category?.id !== candidate.categoryId ? evaluation.category : null;
  const tags = evaluation.tags.filter((tag) => !candidate.tagIds.includes(tag.id));
  if (!payee && !category && tags.length === 0) return null;
  return { candidate, payee, category, tags };
}

/** Evaluates the Rules on every selected Transaction; nothing is written. */
async function plan(db: Queryable, input: ParsedInput, lock: boolean): Promise<Plan> {
  const engine = await engineFor(db, input.ruleIds);
  const candidates = await loadCandidates(db, input.filter, lock);
  const changes: PlannedChange[] = [];
  let skippedTransfers = 0;
  for (const candidate of candidates) {
    const evaluation = evaluateRules(engine.compiled, {
      ...candidate,
      payee:
        candidate.payeeId && candidate.payeeName
          ? { id: candidate.payeeId, name: candidate.payeeName }
          : null,
      isInTransfer: await isInTransfer(db, candidate.id),
    });
    if (evaluation.skipped === 'transfer') skippedTransfers += 1;
    const change = plannedChange(candidate, evaluation);
    if (change) changes.push(change);
  }
  return { examined: candidates.length, skippedTransfers, changes, engine };
}

function describeChange(engine: RuleEngine, change: PlannedChange): TransactionRuleChange {
  const { candidate } = change;
  const ruleName = (ruleId: string) => engine.ruleNames.get(ruleId) ?? '';
  const fields: RuleFieldChange[] = [];
  if (change.payee) {
    fields.push({
      field: 'payee',
      before: candidate.payeeName,
      after: engine.payeeNames.get(change.payee.id) ?? null,
      ruleName: ruleName(change.payee.ruleId),
    });
  }
  if (change.category) {
    fields.push({
      field: 'category',
      before: candidate.categoryName,
      after: engine.categoryNames.get(change.category.id) ?? null,
      ruleName: ruleName(change.category.ruleId),
    });
  }
  if (change.tags.length > 0) {
    const added = change.tags.map((tag) => engine.tagNames.get(tag.id) ?? '');
    const after = [...candidate.tagNames, ...added].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    fields.push({
      field: 'tags',
      before: candidate.tagNames.join(', ') || null,
      after: after.join(', '),
      ruleName: [...new Set(change.tags.map((tag) => ruleName(tag.ruleId)))].join(', '),
    });
  }
  return {
    transactionId: candidate.id,
    bookingDate: candidate.bookingDate,
    accountName: candidate.accountName,
    rawDescription: candidate.rawDescription,
    amountMinor: candidate.amountMinor,
    currency: candidate.currency,
    fields,
  };
}

/** What applying the Rules would change (spec: preview diff). Writes nothing. */
export async function previewApplyRules(
  ctx: ServiceContext,
  input: ApplyRulesInput,
): Promise<ApplyRulesPreview> {
  const values = parseInput(applyInput, input);
  const { examined, skippedTransfers, changes, engine } = await plan(ctx.db, values, false);
  return {
    examined,
    changedCount: changes.length,
    fieldCounts: {
      payee: changes.filter((change) => change.payee).length,
      category: changes.filter((change) => change.category).length,
      tags: changes.filter((change) => change.tags.length > 0).length,
    },
    skippedTransfers,
    changes: changes.slice(0, MAX_PREVIEW_ROWS).map((change) => describeChange(engine, change)),
  };
}

export interface ApplyRulesResult {
  /** The Batch holding every change; null when nothing changed. */
  batchId: string | null;
  /** Transactions changed. */
  count: number;
}

/** One Rule's share of the writes: what it sets on which Transactions. */
interface RuleWrites {
  ids: Set<string>;
  payees: { id: string; value: string }[];
  categories: { id: string; value: string }[];
  tags: { id: string; value: string }[];
}

/** The writes grouped by the Rule that makes them, in run order. */
function writesByRule(changes: readonly PlannedChange[]): Map<string, RuleWrites> {
  const byRule = new Map<string, RuleWrites>();
  const writesOf = (ruleId: string): RuleWrites => {
    const writes = byRule.get(ruleId) ?? { ids: new Set(), payees: [], categories: [], tags: [] };
    byRule.set(ruleId, writes);
    return writes;
  };
  for (const { candidate, payee, category, tags } of changes) {
    const id = candidate.id;
    if (payee) {
      const writes = writesOf(payee.ruleId);
      writes.ids.add(id);
      writes.payees.push({ id, value: payee.id });
    }
    if (category) {
      const writes = writesOf(category.ruleId);
      writes.ids.add(id);
      writes.categories.push({ id, value: category.id });
    }
    for (const tag of tags) {
      const writes = writesOf(tag.ruleId);
      writes.ids.add(id);
      writes.tags.push({ id, value: tag.id });
    }
  }
  return byRule;
}

/**
 * One Rule's writes, set-based. Locked fields are skipped here too (the plan already left them
 * out; this is the backstop).
 */
async function writeRule({ tx }: MutationScope, writes: RuleWrites): Promise<void> {
  const columns = [
    ['payee_id', 'payee', writes.payees],
    ['category_id', 'category', writes.categories],
  ] as const;
  for (const [column, field, rows] of columns) {
    if (rows.length === 0) continue;
    await tx.query(
      `UPDATE "transaction" t SET ${column} = v.value
       FROM unnest($1::uuid[], $2::uuid[]) AS v(id, value)
       WHERE t.id = v.id AND NOT ($3 = ANY(t.locked_fields))`,
      [rows.map((row) => row.id), rows.map((row) => row.value), field],
    );
  }
  if (writes.tags.length === 0) return;
  await tx.query(
    `INSERT INTO transaction_tag (transaction_id, tag_id, source)
     SELECT v.id, v.value, 'rule'
     FROM unnest($1::uuid[], $2::uuid[]) AS v(id, value)
     JOIN "transaction" t ON t.id = v.id
     WHERE NOT ('tags' = ANY(t.locked_fields))
     ON CONFLICT (transaction_id, tag_id) DO NOTHING`,
    [writes.tags.map((row) => row.id), writes.tags.map((row) => row.value)],
  );
}

function summary(engine: RuleEngine, ruleIds: string[] | undefined, count: number): string {
  const noun = count === 1 ? 'Transaction' : 'Transactions';
  const rules = !ruleIds
    ? 'all Rules'
    : ruleIds.length === 1
      ? `Rule "${engine.ruleNames.get(ruleIds[0]!) ?? ''}"`
      : `${ruleIds.length} Rules`;
  return `Applied ${rules} to ${count} ${noun}`;
}

/**
 * Applies the Rules to existing Transactions: the changes `previewApplyRules` shows, written
 * as one History Batch with a summary. Each change is recorded with the Rule that made it as
 * the actor. The writes are set-based, one Rule at a time, so 10 000 Transactions take seconds
 * (see `rules-existing.perf.test.ts`).
 */
export async function applyRulesToExisting(
  ctx: ServiceContext,
  input: ApplyRulesInput,
): Promise<ApplyRulesResult> {
  const values = parseInput(applyInput, input);
  return mutate(ctx, async (scope) => {
    const { changes, engine } = await plan(scope.tx, values, true);
    if (changes.length === 0) return { batchId: null, count: 0 };
    for (const [ruleId, writes] of writesByRule(changes)) {
      const actor: Actor = { type: 'rule', id: ruleId };
      const ruleScope = { ...scope, actor, history: scope.history.as(actor) };
      await recordClassificationChanges(ruleScope, [...writes.ids], () =>
        writeRule(ruleScope, writes),
      );
    }
    await scope.history.summarize(summary(engine, values.ruleIds, changes.length));
    return { batchId: scope.history.batchId, count: changes.length };
  });
}
