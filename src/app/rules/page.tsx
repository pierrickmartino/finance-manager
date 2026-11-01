import type { Metadata } from 'next';
import Link from 'next/link';
import { GHOST_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { countRuleMatches, listRules } from '@/server/services/rules';
import { deleteRuleAction, reorderRulesAction, setRuleEnabledAction } from './actions';
import { describeActions, describeCondition } from './describe';
import { loadRuleOptions } from './load';
import type { RuleDetailRule } from './rule-detail';
import { RulesWorkbench } from './rules-workbench';

export const metadata: Metadata = { title: 'Rules · Finance Manager' };

interface RulesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const param = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

/**
 * Classification Rules (spec 69-82) as master / detail: the Rules in run order on the left,
 * filtered by `?q=`, and the selected one (`?rule=`, else the first shown) on the right.
 */
export default async function RulesPage({ searchParams }: RulesPageProps) {
  const ctx = await getServiceContext();
  const [rules, matchCounts, { names }, fmt, params] = await Promise.all([
    listRules(ctx),
    countRuleMatches(ctx),
    loadRuleOptions(ctx),
    getFormatter(),
    searchParams,
  ]);
  const rows: RuleDetailRule[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    conditions: rule.conditions.map((condition) => describeCondition(condition, names, fmt)),
    actions: describeActions(rule.actions, names),
    matchCount: matchCounts[rule.id] ?? 0,
    toggle: setRuleEnabledAction.bind(null, rule.id, !rule.enabled),
    remove: deleteRuleAction.bind(null, rule.id),
  }));
  const enabled = rows.filter((row) => row.enabled).length;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Rules</h1>
          <p className="max-w-2xl text-sm text-zinc-500">
            {rows.length} Rule{rows.length === 1 ? '' : 's'}, {enabled} enabled. They run top to
            bottom on imports and Manual transactions: per field the first match wins, Tags add up,
            and fields you edited by hand are never changed.
          </p>
        </div>
        <div className="flex gap-2">
          {rows.length > 0 && (
            <Link href="/rules/apply" className={GHOST_BUTTON_CLASS}>
              Apply all Rules
            </Link>
          )}
          <Link href="/rules/new" className={PRIMARY_BUTTON_CLASS}>
            New Rule
          </Link>
        </div>
      </header>
      <RulesWorkbench
        // A new list from the server (added, removed or toggled Rules) resets the run order.
        key={rows.map((row) => `${row.id}:${row.enabled}`).join()}
        rules={rows}
        query={param(params.q) ?? ''}
        ruleId={param(params.rule)}
        reorder={reorderRulesAction}
      />
    </section>
  );
}
