/**
 * Pure helpers for the Rules page: run-order moves, the list filter, the Payee / Category
 * grouping and the selection.
 */

/** One thing a Rule sets, in words, e.g. `{ kind: 'payee', label: 'Payee: Migros' }`. */
export interface RuleActionPart {
  kind: 'payee' | 'category' | 'tag';
  label: string;
}

/** A Payee or a Category a Rule sets, for grouping the list. `parent` is the Category Group. */
export interface RuleGroupRef {
  id: string;
  name: string;
  parent: string | null;
}

/** The Payee and the Category a Rule sets, if any. */
export interface RuleGrouping {
  payee: RuleGroupRef | null;
  category: RuleGroupRef | null;
}

/** What the list groups and filters by and the detail pane shows, besides the bound actions. */
export interface RuleSummary {
  id: string;
  name: string;
  conditions: string[];
  actions: RuleActionPart[];
  grouping: RuleGrouping;
}

export type RuleGroupBy = keyof RuleGrouping;

/** One section of the grouped list. `name` is null for the Rules that set no Payee / Category. */
export interface RuleGroup<T> {
  /** The Payee or Category id, `''` for the unset group. */
  key: string;
  name: string | null;
  parent: string | null;
  /** In run order. */
  rules: T[];
}

const DEFAULT_GROUP_BY: RuleGroupBy = 'payee';

/** The `?group=` value: `category`, else the default Payee grouping. */
export function parseGroupBy(value: string | undefined): RuleGroupBy {
  return value === 'category' ? 'category' : DEFAULT_GROUP_BY;
}

const compareText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

function compareGroups<T>(a: RuleGroup<T>, b: RuleGroup<T>): number {
  if (a.name === null || b.name === null) return a.name === null ? 1 : -1;
  return compareText(a.parent ?? '', b.parent ?? '') || compareText(a.name, b.name);
}

/**
 * The Rules grouped by the Payee or the Category they set: groups A–Z (Categories by Category
 * Group first), the Rules that set none last, and the run order kept inside each group.
 */
export function groupRules<T extends RuleSummary>(
  rules: readonly T[],
  by: RuleGroupBy,
): RuleGroup<T>[] {
  const byKey = Map.groupBy(rules, (rule) => rule.grouping[by]?.id ?? '');
  const groups = [...byKey].map(([key, members]): RuleGroup<T> => {
    const ref = members[0]?.grouping[by] ?? null;
    return { key, name: ref?.name ?? null, parent: ref?.parent ?? null, rules: members };
  });
  return groups.sort(compareGroups);
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

/** The Rules page with this Rule open, keeping the list's filter and grouping. */
export function ruleHref(
  ruleId: string | undefined,
  query: string,
  groupBy: RuleGroupBy = DEFAULT_GROUP_BY,
): string {
  const params = new URLSearchParams();
  if (ruleId) params.set('rule', ruleId);
  if (query) params.set('q', query);
  if (groupBy !== DEFAULT_GROUP_BY) params.set('group', groupBy);
  const search = params.toString();
  return search ? `/rules?${search}` : '/rules';
}
