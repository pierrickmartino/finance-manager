import type { Metadata } from 'next';
import Link from 'next/link';
import { BUTTON_CLASS } from '@/components/named-list';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { countRuleMatches, listRules } from '@/server/services/rules';
import { deleteRuleAction, reorderRulesAction, setRuleEnabledAction } from './actions';
import { describeActions, describeCondition } from './describe';
import { loadRuleOptions } from './load';
import { RuleList, type RuleRow } from './rule-list';

export const metadata: Metadata = { title: 'Rules · Finance Manager' };

/** Classification Rules in run order (spec 69-82). */
export default async function RulesPage() {
  const ctx = await getServiceContext();
  const [rules, matchCounts, { names }, fmt] = await Promise.all([
    listRules(ctx),
    countRuleMatches(ctx),
    loadRuleOptions(ctx),
    getFormatter(),
  ]);
  const rows: RuleRow[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    conditions: rule.conditions.map((condition) => describeCondition(condition, names, fmt)),
    actions: describeActions(rule.actions, names),
    matchCount: matchCounts[rule.id] ?? 0,
    toggle: setRuleEnabledAction.bind(null, rule.id, !rule.enabled),
    remove: deleteRuleAction.bind(null, rule.id),
  }));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Rules</h1>
        <div className="flex gap-2">
          {rows.length > 0 && (
            <Link href="/rules/apply" className={BUTTON_CLASS}>
              Apply all Rules
            </Link>
          )}
          <Link
            href="/rules/new"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            New Rule
          </Link>
        </div>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Rules run in this order on imported files (in the preview) and when you save a Manual
        transaction. For each field, the first matching Rule that sets it wins; Tags add up. Fields
        you edited by hand are never changed. Editing a Rule doesn’t change past Transactions: use
        Apply to reclassify them, after a preview. Matches counts the Transactions a Rule’s
        conditions match now.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No Rules yet.</p>
      ) : (
        <RuleList
          key={rows.map((row) => `${row.id}:${row.enabled}`).join()}
          rows={rows}
          reorder={reorderRulesAction}
        />
      )}
    </section>
  );
}
