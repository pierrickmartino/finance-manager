'use client';
/* PROTOTYPE — Variant B: one dense tree table with search, type tabs, inline rename and bulk actions. */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { INPUT_CLASS } from '@/components/named-list';
import type { CategoryGroup, CategoryGroupType } from '@/server/services/categories';
import { GHOST_BUTTON, groupTotal, PRIMARY_BUTTON, TYPE_ORDER, TYPE_TONE } from './shared';

export const VARIANT_B_NAME = 'Tree table + bulk';

const TYPE_LABELS: Record<CategoryGroupType, string> = {
  income: 'Income',
  expense: 'Expense',
  capital: 'Capital',
};

type Filter = 'all' | CategoryGroupType;

export function VariantB({ groups }: { groups: CategoryGroup[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((group) => filter === 'all' || group.type === filter)
      .map((group) => ({
        ...group,
        categories: needle
          ? group.categories.filter((category) => category.name.toLowerCase().includes(needle))
          : group.categories,
      }))
      .filter((group) => !needle || group.categories.length > 0);
  }, [groups, filter, query]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const fake = (what: string) => setNotice(`Prototype: “${what}” not saved.`);

  return (
    <section className="flex flex-col gap-4 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <div className="flex gap-2">
          <button type="button" className={GHOST_BUTTON} onClick={() => fake('New group')}>
            + Group
          </button>
          <button type="button" className={PRIMARY_BUTTON} onClick={() => fake('New Category')}>
            + Category
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm dark:bg-zinc-800">
          {(['all', ...TYPE_ORDER] as Filter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1 ${
                filter === key ? 'bg-white font-medium shadow-sm dark:bg-zinc-900' : 'text-zinc-500'
              }`}
            >
              {key === 'all' ? 'All' : TYPE_LABELS[key]}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter Categories…"
          className={`${INPUT_CLASS} w-64`}
        />
        {notice && <span className="text-sm text-fuchsia-600">{notice}</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs tracking-wide text-zinc-500 uppercase dark:bg-zinc-950">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Transactions</th>
              <th className="w-24 px-3 py-2" />
            </tr>
          </thead>
          {visible.map((group) => {
            const isCollapsed = collapsed.has(group.id);
            return (
              <tbody key={group.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <tr className="bg-zinc-50/60 font-semibold dark:bg-zinc-950/40">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                      onClick={() => setCollapsed(toggle(collapsed, group.id))}
                      className="text-zinc-400"
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {group.name}{' '}
                    <span className="font-normal text-zinc-400">({group.categories.length})</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 font-normal text-zinc-500">
                      <span className={`h-2 w-2 rounded-full ${TYPE_TONE[group.type].dot}`} />
                      {TYPE_LABELS[group.type]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{groupTotal(group)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className={GHOST_BUTTON}
                      onClick={() => fake('Edit group')}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
                {!isCollapsed &&
                  group.categories.map((category) => (
                    <tr
                      key={category.id}
                      className={`border-t border-zinc-100 dark:border-zinc-800 ${
                        selected.has(category.id) ? 'bg-fuchsia-50/60 dark:bg-fuchsia-950/30' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${category.name}`}
                          checked={selected.has(category.id)}
                          onChange={() => setSelected(toggle(selected, category.id))}
                        />
                      </td>
                      <td
                        className="py-1.5 pr-3 pl-8"
                        onDoubleClick={() => setEditing(category.id)}
                      >
                        {editing === category.id ? (
                          <input
                            autoFocus
                            defaultValue={category.name}
                            onBlur={() => {
                              setEditing(null);
                              fake('Rename');
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === 'Escape') {
                                event.currentTarget.blur();
                              }
                            }}
                            className={INPUT_CLASS}
                          />
                        ) : (
                          <span title="Double-click to rename">{category.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5" />
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <Link
                          href={`/transactions?categoryId=${category.id}`}
                          className="text-zinc-500 hover:underline"
                        >
                          {category.transactionCount}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-right text-zinc-300">⋮⋮</td>
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto flex w-fit items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white shadow-2xl dark:bg-white dark:text-zinc-900">
          <span className="font-medium">{selected.size} selected</span>
          <span className="opacity-30">|</span>
          {['Move to…', 'Merge into…', 'Delete'].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => fake(label)}
              className="rounded-md px-2 py-1 hover:bg-white/10 dark:hover:bg-zinc-900/10"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-md px-2 py-1 opacity-60 hover:opacity-100"
          >
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
