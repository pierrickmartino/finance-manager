'use client';

import { FieldError } from '@/components/form';
import { RuleDetail, type RuleDetailRule } from './rule-detail';
import { RuleList } from './rule-list';
import { useRuleOrder, type ReorderAction } from './use-rule-order';
import { filterRules, groupRules, selectRule, type RuleGroupBy } from './view';

interface RulesWorkbenchProps {
  /** Every Rule, in run order. */
  rules: RuleDetailRule[];
  query: string;
  groupBy: RuleGroupBy;
  /** The Rule the URL names (`?rule=`), if any. */
  ruleId: string | undefined;
  reorder: ReorderAction;
}

/**
 * Master / detail: the Rules grouped by Payee or Category on the left (`?group=`, filtered by
 * `?q=`), the selected one (`?rule=`, else the first shown) on the right. Both sides share the
 * run order, so moving a Rule from the detail pane renumbers it in the list at once.
 */
export function RulesWorkbench({ rules, query, groupBy, ruleId, reorder }: RulesWorkbenchProps) {
  const ruleOrder = useRuleOrder(
    rules.map((rule) => rule.id),
    reorder,
  );
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const ordered = ruleOrder.order
    .map((id) => byId.get(id))
    .filter((rule): rule is RuleDetailRule => rule !== undefined);
  const groups = groupRules(filterRules(ordered, query), groupBy);
  // The first shown is the top of the first group, not Rule #1.
  const selected = selectRule(
    ordered,
    groups.flatMap((group) => group.rules),
    ruleId,
  );
  const positionOf = (id: string) => ruleOrder.order.indexOf(id);

  return (
    <div className="grid items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        {ruleOrder.error && <FieldError message={ruleOrder.error} />}
        <RuleList
          groups={groups.map((group) => ({
            ...group,
            rules: group.rules.map((rule) => ({
              id: rule.id,
              name: rule.name,
              enabled: rule.enabled,
              matchCount: rule.matchCount,
              position: positionOf(rule.id) + 1,
            })),
          }))}
          groupBy={groupBy}
          total={rules.length}
          selectedId={selected?.id}
          query={query}
          drag={ruleOrder}
        />
      </div>
      {selected ? (
        <RuleDetail
          rule={selected}
          position={positionOf(selected.id)}
          total={ordered.length}
          isPending={ruleOrder.isPending}
          moveBy={ruleOrder.moveBy}
        />
      ) : (
        <p className="text-sm text-muted">
          {rules.length === 0 ? 'No Rules yet. Create one to classify imports.' : 'Pick a Rule.'}
        </p>
      )}
    </div>
  );
}
