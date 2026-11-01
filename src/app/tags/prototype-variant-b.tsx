/*
 * PROTOTYPE — throwaway. Variant B, "Ledger table": one dense, sortable row per Tag (`?sort=`)
 * with its usage, money in and out, active period and main Category; edits behind a ⋯ menu.
 */

import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { tagHref, type TagSummary } from './prototype-data';
import { NewTagForm, TagMenu } from './prototype-tag-menu';

export const VARIANT_B_NAME = 'Ledger table';

const SORTS = {
  name: {
    label: 'Tag',
    compare: (a: TagSummary, b: TagSummary) => a.tag.name.localeCompare(b.tag.name),
  },
  count: {
    label: 'Transactions',
    compare: (a: TagSummary, b: TagSummary) => b.tag.transactionCount - a.tag.transactionCount,
  },
  spent: {
    label: 'Out',
    compare: (a: TagSummary, b: TagSummary) => spent(a) - spent(b),
  },
  recent: {
    label: 'Active',
    compare: (a: TagSummary, b: TagSummary) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''),
  },
} as const;

type SortKey = keyof typeof SORTS;

/** Total outflow across Currencies, for sorting only (a prototype shortcut, no FX). */
function spent(summary: TagSummary): number {
  return summary.totals.reduce((sum, total) => sum + total.spentMinor, 0);
}

interface VariantBProps {
  summaries: TagSummary[];
  sort: string | undefined;
  fmt: Formatter;
}

export function VariantB({ summaries, sort, fmt }: VariantBProps) {
  const sortKey: SortKey = sort && sort in SORTS ? (sort as SortKey) : 'count';
  const rows = [...summaries].sort(SORTS[sortKey].compare);
  const tags = summaries.map((s) => s.tag);
  const unused = summaries.filter((s) => s.tag.transactionCount === 0).length;
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-sm text-zinc-500">
            {summaries.length} Tags{unused > 0 && ` · ${unused} unused`}
          </p>
        </div>
        <NewTagForm className="flex items-center gap-1" />
      </header>

      <div className={`${CARD_CLASS} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs tracking-wide text-zinc-400 uppercase dark:border-zinc-800">
            <tr>
              {(['name', 'count', 'spent'] as const).map((key) => (
                <SortHeader key={key} sortKey={key} current={sortKey} />
              ))}
              <th className="px-4 py-2 text-right font-semibold">In</th>
              <SortHeader sortKey="recent" current={sortKey} />
              <th className="px-4 py-2 font-semibold">Mostly</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((summary) => (
              <Row key={summary.tag.id} summary={summary} tags={tags} fmt={fmt} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-zinc-400">No Tags yet.</p>}
      </div>
    </section>
  );
}

function SortHeader({ sortKey, current }: { sortKey: SortKey; current: SortKey }) {
  const isActive = sortKey === current;
  return (
    <th className={`px-4 py-2 font-semibold ${sortKey === 'name' ? '' : 'text-right'}`}>
      <Link
        href={tagHref('B', { sort: sortKey })}
        scroll={false}
        className={isActive ? 'text-zinc-900 dark:text-white' : 'hover:text-zinc-600'}
      >
        {SORTS[sortKey].label}
        {isActive && ' ↓'}
      </Link>
    </th>
  );
}

interface RowProps {
  summary: TagSummary;
  tags: TagSummary['tag'][];
  fmt: Formatter;
}

function Row({ summary, tags, fmt }: RowProps) {
  const { tag, totals, firstDate, lastDate, topCategories } = summary;
  const isUnused = tag.transactionCount === 0;
  return (
    <tr className={isUnused ? 'text-zinc-400' : ''}>
      <td className="px-4 py-2 font-medium whitespace-nowrap">
        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800"># {tag.name}</span>
        {isUnused && (
          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Unused
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        <Link href={`/transactions?tagId=${tag.id}`} className="hover:underline">
          {tag.transactionCount}
        </Link>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {totals.map((t) => (
          <div key={t.currency}>
            {t.spentMinor ? fmt.amount(t.spentMinor, { currency: t.currency }) : '—'}
          </div>
        ))}
      </td>
      <td className="px-4 py-2 text-right text-emerald-600 tabular-nums dark:text-emerald-400">
        {totals.map((t) => (
          <div key={t.currency}>
            {t.receivedMinor ? fmt.amount(t.receivedMinor, { currency: t.currency }) : '—'}
          </div>
        ))}
      </td>
      <td className="px-4 py-2 text-right whitespace-nowrap text-zinc-500 tabular-nums">
        {firstDate && lastDate
          ? firstDate === lastDate
            ? fmt.date(lastDate)
            : `${fmt.date(firstDate)} – ${fmt.date(lastDate)}`
          : '—'}
      </td>
      <td className="px-4 py-2 text-zinc-500">{topCategories[0]?.name ?? '—'}</td>
      <td className="px-2 py-2 text-right">
        <TagMenu tag={tag} tags={tags} trigger="⋯" />
      </td>
    </tr>
  );
}
