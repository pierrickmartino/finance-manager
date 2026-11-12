'use client';

import Link from 'next/link';
import { useState } from 'react';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import type { RuleOrder } from './use-rule-order';
import { ruleHref, type RuleGroup, type RuleGroupBy } from './view';

export interface RuleListItem {
  id: string;
  name: string;
  enabled: boolean;
  matchCount: number;
  /** 1-based place in the run order. */
  position: number;
}

interface RuleListProps {
  /** The Rules the filter shows, grouped, each group in run order. */
  groups: RuleGroup<RuleListItem>[];
  groupBy: RuleGroupBy;
  total: number;
  selectedId: string | undefined;
  query: string;
  drag: Pick<RuleOrder, 'dragged' | 'isPending' | 'handleProps' | 'dropProps'>;
}

const GROUP_BY_LABELS: Record<RuleGroupBy, { option: string; unset: string; plural: string }> = {
  payee: { option: 'Payee', unset: 'No Payee', plural: 'Payees' },
  category: { option: 'Category', unset: 'No Category', plural: 'Categories' },
};

/**
 * The master list: a filter (`?q=`), the grouping (`?group=`: by the Payee or the Category the
 * Rules set) and the Rules in collapsible groups, numbered by run order. Only the selected
 * Rule's group starts open; a filter opens them all. Drag a Rule by its handle to move it.
 */
export function RuleList({ groups, groupBy, total, selectedId, query, drag }: RuleListProps) {
  const labels = GROUP_BY_LABELS[groupBy];
  const ruleCount = groups.reduce((sum, group) => sum + group.rules.length, 0);
  const selectedKey = groups.find((group) =>
    group.rules.some((rule) => rule.id === selectedId),
  )?.key;
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(
    () => new Set(selectedKey === undefined ? [] : [selectedKey]),
  );
  // The selected Rule's group opens whenever it changes or shows again (e.g. a cleared filter).
  const [shownSelectedKey, setShownSelectedKey] = useState(selectedKey);
  if (selectedKey !== shownSelectedKey) {
    setShownSelectedKey(selectedKey);
    if (selectedKey !== undefined) setOpenKeys((keys) => new Set(keys).add(selectedKey));
  }
  const setOpen = (key: string, isOpen: boolean) =>
    setOpenKeys((keys) => {
      const next = new Set(keys);
      if (isOpen) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <nav
      aria-label="Rules list"
      aria-busy={drag.isPending}
      className={`${CARD_CLASS} flex flex-col gap-3 p-3`}
    >
      {/* A GET form: the filter lives in the URL (?q=), like the grouping and the selected Rule. */}
      <form role="search" action="/rules" className="flex items-center gap-1">
        {selectedId && <input type="hidden" name="rule" value={selectedId} />}
        {groupBy !== 'payee' && <input type="hidden" name="group" value={groupBy} />}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Filter Rules, conditions, Categories…"
          aria-label="Filter Rules"
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        {query && (
          <Link href={ruleHref(selectedId, '', groupBy)} className={GHOST_BUTTON_CLASS}>
            Clear
          </Link>
        )}
      </form>

      <GroupByToggle groupBy={groupBy} selectedId={selectedId} query={query} />

      <div className="flex max-h-[65vh] flex-col gap-0.5 overflow-y-auto">
        {groups.map((group) => {
          const label = group.name ?? labels.unset;
          return (
            <details
              // Switching the grouping starts the sections afresh.
              key={`${groupBy}:${group.key}`}
              open={query !== '' || openKeys.has(group.key)}
              onToggle={(event) => setOpen(group.key, event.currentTarget.open)}
              className="group"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden
                  className="w-3 text-faint transition-transform group-open:rotate-90 motion-reduce:transition-none"
                >
                  ›
                </span>
                <span
                  className={`min-w-0 flex-1 break-words font-medium ${group.name === null ? 'italic text-muted' : ''}`}
                >
                  {group.parent && (
                    <span className="font-normal text-muted">{group.parent} › </span>
                  )}
                  {label}
                </span>
                <span className="rounded-md bg-sunken px-2 text-xs tabular-nums text-ink-soft">
                  {group.rules.length}
                  <span className="sr-only"> Rules</span>
                </span>
              </summary>
              <ol
                aria-label={`Rules: ${group.parent ? `${group.parent} › ` : ''}${label}`}
                className="mb-1 ml-4 flex flex-col gap-0.5 border-l border-rule pl-1"
              >
                {group.rules.map((rule) => (
                  <li
                    key={rule.id}
                    data-rule-id={rule.id}
                    {...drag.dropProps(rule.id)}
                    className={`flex items-center gap-1 ${drag.dragged === rule.id ? 'opacity-50' : ''}`}
                  >
                    <span
                      {...drag.handleProps(rule.id)}
                      aria-label={`Drag ${rule.name}`}
                      role="img"
                      title="Drag to change the run order"
                      className="cursor-grab select-none px-1 text-faint"
                    >
                      ⠿
                    </span>
                    <RuleLink
                      rule={rule}
                      isActive={rule.id === selectedId}
                      query={query}
                      groupBy={groupBy}
                    />
                  </li>
                ))}
              </ol>
            </details>
          );
        })}
      </div>
      {groups.length === 0 ? (
        <p className="px-2 text-sm text-faint">
          {total === 0 ? 'No Rules yet.' : `No Rule matches "${query}".`}
        </p>
      ) : (
        <p className="px-2 text-xs text-muted">
          {ruleCount} Rule{ruleCount === 1 ? '' : 's'} in {groups.length}{' '}
          {groups.length === 1 ? labels.option : labels.plural}. #1 runs first.
        </p>
      )}
    </nav>
  );
}

function GroupByToggle({
  groupBy,
  selectedId,
  query,
}: {
  groupBy: RuleGroupBy;
  selectedId: string | undefined;
  query: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted">
      <span id="rules-group-by">Group by</span>
      <div
        role="group"
        aria-labelledby="rules-group-by"
        className="flex rounded-lg bg-sunken p-0.5"
      >
        {(Object.keys(GROUP_BY_LABELS) as RuleGroupBy[]).map((by) => (
          <Link
            key={by}
            href={ruleHref(selectedId, query, by)}
            scroll={false}
            aria-current={by === groupBy ? 'true' : undefined}
            className={`rounded-md px-3 py-1 font-medium ${
              by === groupBy ? 'bg-surface text-ink shadow-sm' : 'hover:text-ink'
            }`}
          >
            {GROUP_BY_LABELS[by].option}
          </Link>
        ))}
      </div>
    </div>
  );
}

function RuleLink({
  rule,
  isActive,
  query,
  groupBy,
}: {
  rule: RuleListItem;
  isActive: boolean;
  query: string;
  groupBy: RuleGroupBy;
}) {
  return (
    <Link
      href={ruleHref(rule.id, query, groupBy)}
      scroll={false}
      aria-current={isActive ? 'page' : undefined}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
        isActive ? 'bg-ink text-white' : 'hover:bg-sunken'
      }`}
    >
      <span
        title="Run order"
        className={`w-8 shrink-0 text-right text-xs tabular-nums ${isActive ? '' : 'text-muted'}`}
      >
        #{rule.position}
      </span>
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${rule.enabled ? 'bg-positive' : 'bg-rule-strong'}`}
      />
      <span className={`min-w-0 flex-1 break-words ${rule.enabled ? 'font-medium' : ''}`}>
        {rule.name}
        {!rule.enabled && <span className="ml-1 text-xs">(Disabled)</span>}
      </span>
      <span className={`text-xs tabular-nums ${isActive ? '' : 'text-muted'}`}>
        <span className="sr-only">Matches: </span>
        {rule.matchCount}
      </span>
    </Link>
  );
}
