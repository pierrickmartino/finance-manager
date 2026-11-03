'use client';

/**
 * PROTOTYPE variant C — "Index + table": a Payee / Category index on the left (A–Z, own filter,
 * Rule counts), the chosen entry's Rules as a table on the right. A row opens inline.
 */
import Link from 'next/link';
import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { FieldError } from '@/components/form';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import { RuleDetail } from '../rule-detail';
import type { ReorderAction } from '../use-rule-order';
import { groupRules, type GroupBy, type PrototypeRule } from './shared';
import { protoHref, useOrdered } from './use-ordered';

interface Props {
  rules: PrototypeRule[];
  ruleId: string | undefined;
  groupBy: GroupBy;
  facet: string | undefined;
  reorder: ReorderAction;
}

export function VariantC({ rules, ruleId, groupBy, facet, reorder }: Props) {
  const { ruleOrder, ordered, positionOf } = useOrdered(rules, reorder);
  const [indexFilter, setIndexFilter] = useState('');
  const groups = groupRules(ordered, groupBy);
  const current =
    groups.find((group) => group.key === facet) ??
    groups.find((group) => group.rules.some((rule) => rule.id === ruleId)) ??
    groups[0];
  const shown = groups.filter((group) =>
    group.label.toLowerCase().includes(indexFilter.trim().toLowerCase()),
  );
  const href = (params: Record<string, string | undefined>) =>
    protoHref('C', { group: groupBy, facet: current?.key, ...params });

  return (
    <div className="grid items-start gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className={`${CARD_CLASS} flex flex-col gap-2 p-3`}>
        <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-0.5 text-sm dark:bg-zinc-800">
          {(['payee', 'category'] as const).map((by) => (
            <Link
              key={by}
              href={protoHref('C', { group: by })}
              scroll={false}
              className={`rounded-md py-1 text-center font-medium ${
                by === groupBy ? 'bg-white shadow-sm dark:bg-zinc-950' : 'text-zinc-500'
              }`}
            >
              {by === 'payee' ? 'Payees' : 'Categories'}
            </Link>
          ))}
        </div>
        <input
          type="search"
          value={indexFilter}
          onChange={(event) => setIndexFilter(event.target.value)}
          placeholder={`Find a ${groupBy === 'payee' ? 'Payee' : 'Category'}…`}
          className={INPUT_CLASS}
        />
        <ul className="flex max-h-[68vh] flex-col overflow-y-auto text-sm">
          {shown.map((group, index) => {
            const letterOf = (g: typeof group | undefined) =>
              !g ? '' : g.isEmpty ? '—' : (g.label[0] ?? '').toUpperCase();
            const letter = letterOf(group);
            const showLetter = letter !== letterOf(shown[index - 1]);
            const isActive = group.key === current?.key;
            return (
              <li key={group.key}>
                {showLetter && (
                  <p className="sticky top-0 bg-white px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:bg-zinc-900">
                    {letter}
                  </p>
                )}
                <Link
                  href={href({ facet: group.key, rule: undefined })}
                  scroll={false}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  } ${group.isEmpty ? 'italic' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  {group.enabled < group.rules.length && (
                    <span title="Has disabled Rules" className="text-xs text-amber-500">
                      ●
                    </span>
                  )}
                  <span className="text-xs tabular-nums opacity-70">{group.rules.length}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {current && (
        <section className="flex min-w-0 flex-col gap-4">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {groupBy === 'payee' ? 'Payee' : (current.parent ?? 'Category')}
              </p>
              <h2 className="text-xl font-semibold">
                {current.parent && !current.isEmpty
                  ? current.label.split(' › ').slice(1).join(' › ')
                  : current.label}
              </h2>
              <p className="text-sm text-zinc-500">
                {current.rules.length} Rule{current.rules.length === 1 ? '' : 's'} ·{' '}
                {current.enabled} enabled · {current.matches} Transactions match now
              </p>
            </div>
            <Link href="/rules/new" className={PRIMARY_BUTTON_CLASS}>
              New Rule for this {groupBy === 'payee' ? 'Payee' : 'Category'}
            </Link>
          </header>
          {ruleOrder.error && <FieldError message={ruleOrder.error} />}
          <div className={`${CARD_CLASS} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-3 py-2 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">Rule</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Also sets</th>
                  <th className="px-3 py-2 text-right font-medium">Matches</th>
                  <th className="px-3 py-2 font-medium">On</th>
                </tr>
              </thead>
              <tbody>
                {current.rules.map((rule) => {
                  const isOpen = rule.id === ruleId;
                  const also = rule.actions.filter((part) => part.kind !== groupBy);
                  return [
                    <tr
                      key={rule.id}
                      className={`border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800 ${isOpen ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}`}
                    >
                      <td className="px-3 py-2 tabular-nums text-zinc-400">
                        #{positionOf(rule.id) + 1}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={href({ rule: isOpen ? undefined : rule.id })}
                          scroll={false}
                          className={`font-medium hover:underline ${rule.enabled ? '' : 'text-zinc-400'}`}
                        >
                          {isOpen ? '▾ ' : '▸ '}
                          {rule.name}
                        </Link>
                      </td>
                      <td className="max-w-xs px-3 py-2 text-zinc-600 dark:text-zinc-300">
                        {rule.conditions.join(' · ')}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {also.map((part, i) => (
                            <span
                              key={i}
                              className="rounded bg-zinc-100 px-1.5 text-xs dark:bg-zinc-800"
                            >
                              {part.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{rule.matchCount}</td>
                      <td className="px-3 py-2">
                        <ActionForm action={rule.toggle} label={`Toggle ${rule.name}`}>
                          <button
                            type="submit"
                            role="switch"
                            aria-checked={rule.enabled}
                            aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                            className={`relative h-4 w-7 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                          >
                            <span
                              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white ${rule.enabled ? 'left-3.5' : 'left-0.5'}`}
                            />
                          </button>
                        </ActionForm>
                      </td>
                    </tr>,
                    isOpen && (
                      <tr key={`${rule.id}-detail`}>
                        <td colSpan={6} className="bg-zinc-50 p-3 dark:bg-zinc-800/50">
                          <RuleDetail
                            rule={rule}
                            position={positionOf(rule.id)}
                            total={ordered.length}
                            isPending={ruleOrder.isPending}
                            moveBy={ruleOrder.moveBy}
                          />
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
