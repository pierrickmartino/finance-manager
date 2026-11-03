'use client';

/** PROTOTYPE — the run order shared by every variant (same hook as the real page). */
import { useRuleOrder, type ReorderAction } from '../use-rule-order';
import type { PrototypeRule } from './shared';

export function useOrdered<T extends PrototypeRule>(rules: readonly T[], reorder: ReorderAction) {
  const ruleOrder = useRuleOrder(
    rules.map((rule) => rule.id),
    reorder,
  );
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const ordered = ruleOrder.order
    .map((id) => byId.get(id))
    .filter((rule): rule is T => rule !== undefined);
  const positionOf = (id: string) => ruleOrder.order.indexOf(id);
  return { ruleOrder, ordered, positionOf };
}

/** `/rules?variant=…&…`, dropping empty values. */
export function protoHref(variant: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams({ variant });
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `/rules?${search.toString()}`;
}
