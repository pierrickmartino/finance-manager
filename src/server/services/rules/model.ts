import { z } from 'zod';
import type { Queryable } from '@/server/db/client';
import { NotFoundError } from '../errors';
import type { HistorySnapshot, JsonValue } from '../history';
import type { RuleDefinition } from './evaluator';

/** A stored Rule. Rules run in `sort` order (spec 75). */
export interface Rule extends RuleDefinition {
  sort: number;
}

export const SELECT_RULE = `
  SELECT r.id, r.name, r.sort, r.enabled, r.conditions, r.actions
  FROM rule r`;

export const RULE_ORDER = 'r.sort, r.created_at, r.id';

const uuid = z.uuid();

export async function findRule(db: Queryable, id: string, lock = false): Promise<Rule> {
  const notFound = new NotFoundError('Rule not found');
  if (!uuid.safeParse(id).success) throw notFound;
  const result = await db.query<Rule>(
    `${SELECT_RULE} WHERE r.id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  const rule = result.rows[0];
  if (!rule) throw notFound;
  return rule;
}

/** Every Rule in run order. */
export async function loadRules(db: Queryable): Promise<Rule[]> {
  const result = await db.query<Rule>(`${SELECT_RULE} ORDER BY ${RULE_ORDER}`);
  return result.rows;
}

/** What History records about a Rule. Conditions and actions are recorded as JSON values. */
export function ruleSnapshot(rule: Rule): HistorySnapshot {
  return {
    name: rule.name,
    sort: rule.sort,
    enabled: rule.enabled,
    conditions: rule.conditions as unknown as JsonValue,
    actions: rule.actions as unknown as JsonValue,
  };
}
