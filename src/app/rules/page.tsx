import type { Metadata } from 'next';
import Link from 'next/link';
import { BUTTON_CLASS } from '@/components/named-list';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { countRuleMatches, listRules } from '@/server/services/rules';
import { deleteRuleAction, reorderRulesAction, setRuleEnabledAction } from './actions';
import { describeActions, describeCondition } from './describe';
import { loadRuleOptions } from './load';
import { RuleList, type RuleRow } from './rule-list';
import type { ProtoRule } from './_prototype/shared';
import { VariantA, name as nameA } from './_prototype/variant-a-pipeline';
import { VariantB, name as nameB } from './_prototype/variant-b-inspector';
import { VariantC, name as nameC } from './_prototype/variant-c-coverage';

export const metadata: Metadata = { title: 'Rules · Finance Manager' };

// PROTOTYPE — three Rules page layouts on /rules, switchable via ?variant= (A, B, C; default
// `current` is today's page). Data fetching is unchanged; only the rendering swaps. Disabled
// in production builds. Not for main: fold the winner in, then drop `_prototype/` and the bar.
const VARIANTS = [
  { key: 'current', name: 'Today' },
  { key: 'A', name: nameA },
  { key: 'B', name: nameB },
  { key: 'C', name: nameC },
];

interface RulesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Classification Rules in run order (spec 69-82). */
export default async function RulesPage({ searchParams }: RulesPageProps) {
  const params = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : undefined,
    ]),
  );
  const variant =
    process.env.NODE_ENV !== 'production' && VARIANTS.some((v) => v.key === params.variant)
      ? params.variant!
      : 'current';
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

  if (variant !== 'current') {
    const protoRows: ProtoRule[] = rows.map((row, index) => {
      const { payeeId, categoryId, tagIds } = rules[index]!.actions;
      return {
        ...row,
        payee: payeeId ? (names.payees.get(payeeId) ?? '(deleted)') : null,
        category: categoryId ? (names.categories.get(categoryId) ?? '(deleted)') : null,
        tags: tagIds.map((id) => names.tags.get(id) ?? '(deleted)'),
      };
    });
    const key = rows.map((row) => `${row.id}:${row.enabled}`).join();
    const props = {
      rows: protoRows,
      reorder: reorderRulesAction,
      params,
    };
    return (
      <>
        {variant === 'A' && <VariantA key={key} {...props} />}
        {variant === 'B' && <VariantB key={key} {...props} />}
        {variant === 'C' && <VariantC key={key} {...props} />}
        <PrototypeSwitcher variants={VARIANTS} current={variant} />
      </>
    );
  }

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
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </section>
  );
}
