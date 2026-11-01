/** Pure helpers for the Rules page: run-order moves, the list filter and the selection. */

/** One thing a Rule sets, in words, e.g. `{ kind: 'payee', label: 'Payee: Migros' }`. */
export interface RuleActionPart {
  kind: 'payee' | 'category' | 'tag';
  label: string;
}

/** What the list filter searches and the detail pane shows, besides the bound actions. */
export interface RuleSummary {
  id: string;
  name: string;
  conditions: string[];
  actions: RuleActionPart[];
}

/** `ids` with `id` moved to where `targetId` is, as a new array. */
export function moved(ids: readonly string[], id: string, targetId: string): string[] {
  const without = ids.filter((other) => other !== id);
  const at = ids.indexOf(targetId);
  return [...without.slice(0, at), id, ...without.slice(at)];
}

/** Lower case, accents removed, so "Café" matches "cafe". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * The Rules whose name, conditions or actions contain the query (ignoring case and accents),
 * in run order; all of them for a blank query.
 */
export function filterRules<T extends RuleSummary>(rules: readonly T[], query: string): T[] {
  const needle = fold(query.trim());
  if (!needle) return [...rules];
  return rules.filter((rule) =>
    fold([rule.name, ...rule.conditions, ...rule.actions.map((a) => a.label)].join('\n')).includes(
      needle,
    ),
  );
}

/**
 * The Rule shown in the detail pane: the one the URL names (even when the filter hides it),
 * else the first one the list shows.
 */
export function selectRule<T extends RuleSummary>(
  rules: readonly T[],
  visible: readonly T[],
  ruleId: string | undefined,
): T | undefined {
  return rules.find((rule) => rule.id === ruleId) ?? visible[0];
}

/** The Rules page with this Rule open, keeping the list's filter. */
export function ruleHref(ruleId: string, query: string): string {
  const params = new URLSearchParams({ rule: ruleId });
  if (query) params.set('q', query);
  return `/rules?${params.toString()}`;
}
