'use client';

/**
 * PROTOTYPE variant B — "Grouped sidebar": keeps master / detail, but the left list is grouped
 * by Payee or Category (collapsible sections with counts). Run order still numbers every Rule.
 */
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import { RuleDetail } from '../rule-detail';
import type { ReorderAction } from '../use-rule-order';
import { filterRules, selectRule } from '../view';
import { groupRules, type GroupBy, type PrototypeRule } from './shared';
import { protoHref, useOrdered } from './use-ordered';

interface Props {
  rules: PrototypeRule[];
  query: string;
  ruleId: string | undefined;
  groupBy: GroupBy;
  reorder: ReorderAction;
}

export function VariantB({ rules, query, ruleId, groupBy, reorder }: Props) {
  const { ruleOrder, ordered, positionOf } = useOrdered(rules, reorder);
  const visible = filterRules(ordered, query);
  const selected = selectRule(ordered, visible, ruleId);
  const groups = groupRules(visible, groupBy);
  const href = (params: Record<string, string | undefined>) =>
    protoHref('B', { group: groupBy, q: query, rule: selected?.id, ...params });

  return (
    <div className="grid items-start gap-6 md:grid-cols-[20rem_minmax(0,1fr)] lg:grid-cols-[24rem_minmax(0,1fr)]">
      <nav aria-label="Rules list" className={`${CARD_CLASS} flex flex-col gap-3 p-3`}>
        <form role="search" action="/rules" className="flex items-center gap-1">
          <input type="hidden" name="variant" value="B" />
          <input type="hidden" name="group" value={groupBy} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Filter Rules, conditions, Categories…"
            aria-label="Filter Rules"
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          {query && (
            <Link href={href({ q: undefined })} className={GHOST_BUTTON_CLASS}>
              Clear
            </Link>
          )}
        </form>

        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
          <span>Group by</span>
          <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
            {(['payee', 'category'] as const).map((by) => (
              <Link
                key={by}
                href={href({ group: by })}
                scroll={false}
                className={`rounded-md px-3 py-1 font-medium ${
                  by === groupBy
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white'
                    : 'text-zinc-500'
                }`}
              >
                {by === 'payee' ? 'Payee' : 'Category'}
              </Link>
            ))}
          </div>
        </div>
        {ruleOrder.error && <FieldError message={ruleOrder.error} />}

        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
          {groups.map((group) => (
            <details
              key={`${groupBy}:${group.key}`}
              open={query !== '' || group.rules.some((rule) => rule.id === selected?.id)}
              className="group rounded-lg"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <span className="w-3 text-zinc-400 transition-transform group-open:rotate-90">
                  ›
                </span>
                <span
                  className={`min-w-0 flex-1 truncate font-medium ${group.isEmpty ? 'italic text-zinc-500' : ''}`}
                >
                  {group.parent && !group.isEmpty ? (
                    <>
                      <span className="font-normal text-zinc-500">{group.parent} › </span>
                      {group.label.split(' › ').slice(1).join(' › ')}
                    </>
                  ) : (
                    group.label
                  )}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 text-xs tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {group.rules.length}
                </span>
              </summary>
              <ol className="mb-1 ml-5 flex flex-col gap-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-800">
                {group.rules.map((rule) => {
                  const isActive = rule.id === selected?.id;
                  return (
                    <li key={rule.id}>
                      <Link
                        href={href({ rule: rule.id })}
                        scroll={false}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
                          isActive
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`w-6 text-right text-xs tabular-nums ${isActive ? '' : 'text-zinc-400'}`}
                        >
                          #{positionOf(rule.id) + 1}
                        </span>
                        <span
                          aria-hidden
                          className={`h-2 w-2 shrink-0 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        />
                        <span
                          className={`min-w-0 flex-1 truncate ${rule.enabled ? '' : 'text-zinc-400'}`}
                        >
                          {rule.name}
                        </span>
                        <span className={`text-xs tabular-nums ${isActive ? '' : 'text-zinc-500'}`}>
                          {rule.matchCount}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </details>
          ))}
          {groups.length === 0 && (
            <p className="px-2 text-sm text-zinc-400">No Rule matches &quot;{query}&quot;.</p>
          )}
        </div>
        <p className="px-2 text-xs text-zinc-400">
          {groups.length} {groupBy === 'payee' ? 'Payees' : 'Categories'} · {visible.length} Rules ·
          #n is the run order
        </p>
      </nav>
      {selected ? (
        <RuleDetail
          rule={selected}
          position={positionOf(selected.id)}
          total={ordered.length}
          isPending={ruleOrder.isPending}
          moveBy={ruleOrder.moveBy}
        />
      ) : (
        <p className="text-sm text-zinc-500">Pick a Rule.</p>
      )}
    </div>
  );
}
