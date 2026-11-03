/**
 * PROTOTYPE — Rules page grouped by Payee / Category.
 * "Four variants of the Rules page, switchable via `?variant=` (A = current, B/C/D = grouped),
 * on the existing `/rules` route." Throwaway: no tests, see the prototype branch.
 */
import type { RuleDetailRule } from '../rule-detail';

export interface PrototypeRule extends RuleDetailRule {
  payee: string | null;
  categoryGroup: string | null;
  category: string | null;
}

export type GroupBy = 'payee' | 'category';

export interface RuleGroup<T> {
  key: string;
  label: string;
  /** Category Group, when grouping by Category. */
  parent: string | null;
  isEmpty: boolean;
  rules: T[];
  matches: number;
  enabled: number;
}

export const NO_PAYEE = 'No Payee set';
export const NO_CATEGORY = 'No Category set';

/** Groups `rules` (kept in run order inside each group), groups A–Z with the empty one last. */
export function groupRules<T extends PrototypeRule>(
  rules: readonly T[],
  by: GroupBy,
): RuleGroup<T>[] {
  const groups = new Map<string, RuleGroup<T>>();
  for (const rule of rules) {
    const label =
      by === 'payee'
        ? rule.payee
        : rule.category
          ? `${rule.categoryGroup} › ${rule.category}`
          : null;
    const key = label ?? '∅';
    const group = groups.get(key) ?? {
      key,
      label: label ?? (by === 'payee' ? NO_PAYEE : NO_CATEGORY),
      parent: by === 'category' ? rule.categoryGroup : null,
      isEmpty: label === null,
      rules: [],
      matches: 0,
      enabled: 0,
    };
    group.rules.push(rule);
    group.matches += rule.matchCount;
    group.enabled += rule.enabled ? 1 : 0;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.isEmpty !== b.isEmpty ? (a.isEmpty ? 1 : -1) : a.label.localeCompare(b.label),
  );
}

export const VARIANTS = [
  { key: 'A', name: 'Current' },
  { key: 'B', name: 'Grouped sidebar' },
  { key: 'C', name: 'Index + table' },
  { key: 'D', name: 'Category › Payee outline' },
];
