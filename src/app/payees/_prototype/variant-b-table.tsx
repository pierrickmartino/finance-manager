'use client';
/* PROTOTYPE — Variant B: one dense, sortable table with checkboxes and a floating bulk bar. */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { INPUT_CLASS } from '@/components/named-list';
import type { Payee } from '@/server/services/payees';
import { Menu } from '../../categories/menu';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '../../categories/styles';
import { plural } from './shared';
import { prototypeStubAction } from './stub-action';

export const VARIANT_B_NAME = 'Table + bulk merge';

type Sort = 'name' | 'count';
type Show = 'all' | 'used' | 'unused';

export function VariantB({ payees }: { payees: Payee[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('count');
  const [show, setShow] = useState<Show>('all');
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.toLowerCase();
    return payees
      .filter((payee) => payee.name.toLowerCase().includes(needle))
      .filter((payee) =>
        show === 'all'
          ? true
          : show === 'used'
            ? payee.transactionCount > 0
            : !payee.transactionCount,
      )
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : b.transactionCount - a.transactionCount || a.name.localeCompare(b.name),
      );
  }, [payees, query, sort, show]);

  const toggle = (id: string) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisibleChecked = rows.length > 0 && rows.every((row) => checked.has(row.id));
  const selected = payees.filter((payee) => checked.has(payee.id));
  const unusedCount = payees.filter((payee) => payee.transactionCount === 0).length;

  return (
    <section className="flex flex-col gap-4 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payees</h1>
          <p className="text-sm text-zinc-500">
            {plural(payees.length, 'Payee')} · {unusedCount} unused
          </p>
        </div>
        <ActionForm action={prototypeStubAction} label="New Payee" className="flex gap-2">
          <input
            name="name"
            aria-label="New Payee name"
            placeholder="New Payee…"
            required
            maxLength={100}
            className={INPUT_CLASS}
          />
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            Add
          </button>
        </ActionForm>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Payees…"
          aria-label="Search Payees"
          className={`${INPUT_CLASS} w-64 max-w-full`}
        />
        <div className="flex rounded-md border border-zinc-200 p-0.5 text-sm dark:border-zinc-800">
          {(['all', 'used', 'unused'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setShow(option)}
              className={`rounded px-2 py-0.5 capitalize ${
                show === option
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="text-sm text-zinc-400">{rows.length} shown</span>
      </div>

      <div className={`${CARD_CLASS} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs text-zinc-500 uppercase dark:border-zinc-800">
            <tr>
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={allVisibleChecked}
                  onChange={() =>
                    setChecked(allVisibleChecked ? new Set() : new Set(rows.map((row) => row.id)))
                  }
                />
              </th>
              <SortHeader
                label="Payee"
                isActive={sort === 'name'}
                onClick={() => setSort('name')}
              />
              <SortHeader
                label="Transactions"
                isActive={sort === 'count'}
                onClick={() => setSort('count')}
                alignRight
              />
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((payee) => (
              <tr
                key={payee.id}
                className={`group ${checked.has(payee.id) ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}`}
              >
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${payee.name}`}
                    checked={checked.has(payee.id)}
                    onChange={() => toggle(payee.id)}
                  />
                </td>
                <td className="py-2 pr-4" onDoubleClick={() => setRenaming(payee.id)}>
                  {renaming === payee.id ? (
                    <ActionForm action={prototypeStubAction} label={`Rename ${payee.name}`}>
                      <input
                        name="name"
                        defaultValue={payee.name}
                        aria-label={`Name of ${payee.name}`}
                        autoFocus
                        onBlur={() => setRenaming(null)}
                        onKeyDown={(event) => event.key === 'Escape' && setRenaming(null)}
                        className={INPUT_CLASS}
                      />
                    </ActionForm>
                  ) : (
                    <span title="Double-click to rename" className="cursor-text">
                      {payee.name}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {payee.transactionCount === 0 ? (
                    <span className="text-zinc-300 dark:text-zinc-600">0</span>
                  ) : (
                    <Link href={`/transactions?payeeId=${payee.id}`} className="hover:underline">
                      {payee.transactionCount}
                    </Link>
                  )}
                </td>
                <td className="pr-2">
                  <Menu
                    trigger="⋯"
                    label={`Actions for ${payee.name}`}
                    triggerClassName={`${GHOST_BUTTON_CLASS} sm:opacity-60 sm:group-hover:opacity-100`}
                  >
                    <button
                      type="button"
                      onClick={() => setRenaming(payee.id)}
                      className={`${GHOST_BUTTON_CLASS} text-left`}
                    >
                      Rename
                    </button>
                    {payee.transactionCount === 0 && (
                      <ActionForm
                        action={prototypeStubAction}
                        label={`Delete ${payee.name}`}
                        confirmMessage={`Delete "${payee.name}"?`}
                      >
                        <button type="submit" className={DANGER_BUTTON_CLASS}>
                          Delete Payee
                        </button>
                      </ActionForm>
                    )}
                  </Menu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-400">No Payee matches.</p>
        )}
      </div>

      {selected.length > 0 && <BulkBar selected={selected} onClear={() => setChecked(new Set())} />}
    </section>
  );
}

function SortHeader({
  label,
  isActive,
  onClick,
  alignRight,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  alignRight?: boolean;
}) {
  return (
    <th className={`py-2 pr-4 ${alignRight ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={onClick}
        className={isActive ? 'text-zinc-900 dark:text-white' : ''}
      >
        {label} {isActive ? '↓' : ''}
      </button>
    </th>
  );
}

/** Merge the selection into one of them (the busiest by default), or delete the unused ones. */
function BulkBar({ selected, onClear }: { selected: Payee[]; onClear: () => void }) {
  const byCount = [...selected].sort((a, b) => b.transactionCount - a.transactionCount);
  const unused = selected.filter((payee) => payee.transactionCount === 0);
  const moving = selected.reduce((sum, payee) => sum + payee.transactionCount, 0);
  return (
    <div className="fixed bottom-16 left-1/2 z-40 flex w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-2xl dark:bg-white dark:text-zinc-900">
      <span className="font-medium">{selected.length} selected</span>
      {selected.length > 1 && (
        <ActionForm
          action={prototypeStubAction}
          label="Merge selected"
          confirmMessage={`Merge ${selected.length} Payees (${moving} Transactions) into the chosen one?`}
          className="flex items-center gap-2"
        >
          <select
            name="targetId"
            defaultValue={byCount[0]!.id}
            aria-label="Merge selected into"
            className="rounded-md bg-white/10 px-2 py-1 dark:bg-zinc-900/10"
          >
            {byCount.map((payee) => (
              <option key={payee.id} value={payee.id} className="text-zinc-900">
                Merge into {payee.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-white px-2 py-1 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-white"
          >
            Merge
          </button>
        </ActionForm>
      )}
      {unused.length > 0 && (
        <ActionForm
          action={prototypeStubAction}
          label="Delete unused selected"
          confirmMessage={`Delete ${plural(unused.length, 'unused Payee')}?`}
        >
          <button type="submit" className="text-rose-300 hover:underline dark:text-rose-600">
            Delete {unused.length} unused
          </button>
        </ActionForm>
      )}
      <button type="button" onClick={onClear} className="ml-auto opacity-70 hover:opacity-100">
        Clear
      </button>
    </div>
  );
}
