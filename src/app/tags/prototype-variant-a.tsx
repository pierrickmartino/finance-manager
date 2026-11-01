/*
 * PROTOTYPE — throwaway. Variant A, "Master / detail": the Tags on the left like the Payees
 * page, the selected one (`?tag=`) on the right with its totals, Categories and latest
 * Transactions.
 */

import Link from 'next/link';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { TransactionListItem } from '@/server/services/transactions';
import { fold, tagHref, transactionsLabel, type TagSummary } from './prototype-data';
import { NewTagForm, TagMenu } from './prototype-tag-menu';

export const VARIANT_A_NAME = 'Master / detail';

interface VariantAProps {
  summaries: TagSummary[];
  selected: TagSummary | undefined;
  recent: TransactionListItem[];
  query: string;
  fmt: Formatter;
}

export function VariantA({ summaries, selected, recent, query, fmt }: VariantAProps) {
  const needle = fold(query);
  const visible = needle
    ? summaries.filter((summary) => fold(summary.tag.name).includes(needle))
    : summaries;
  const total = summaries.reduce((sum, { tag }) => sum + tag.transactionCount, 0);
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Tags</h1>
        <p className="text-sm text-zinc-500">
          {summaries.length} Tag{summaries.length === 1 ? '' : 's'} · {transactionsLabel(total)}{' '}
          tagged
        </p>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-[16rem_1fr] lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Tags" className={`${CARD_CLASS} flex flex-col gap-3 p-3`}>
          <form role="search" action="/tags" className="flex items-center gap-1">
            <input type="hidden" name="variant" value="A" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Filter Tags…"
              aria-label="Filter Tags"
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            />
          </form>
          <ul className="flex max-h-[65vh] flex-col gap-0.5 overflow-y-auto">
            {visible.map(({ tag }) => {
              const isActive = tag.id === selected?.tag.id;
              return (
                <li key={tag.id}>
                  <Link
                    href={tagHref('A', { tag: tag.id, q: query })}
                    scroll={false}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      isActive
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className="truncate"># {tag.name}</span>
                    <span
                      className={`text-xs tabular-nums ${isActive ? 'opacity-70' : 'text-zinc-400'}`}
                    >
                      {tag.transactionCount}
                    </span>
                  </Link>
                </li>
              );
            })}
            {visible.length === 0 && (
              <p className="px-2 text-sm text-zinc-400">
                {query ? `No Tag matches "${query}".` : 'No Tags yet.'}
              </p>
            )}
          </ul>
          <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <NewTagForm className="flex items-center gap-1" />
          </div>
        </nav>
        {selected ? (
          <Detail summary={selected} tags={summaries.map((s) => s.tag)} recent={recent} fmt={fmt} />
        ) : (
          <p className="text-sm text-zinc-500">
            No Tags yet. Add one, or type one on a Transaction.
          </p>
        )}
      </div>
    </section>
  );
}

interface DetailProps {
  summary: TagSummary;
  tags: TagSummary['tag'][];
  recent: TransactionListItem[];
  fmt: Formatter;
}

function Detail({ summary, tags, recent, fmt }: DetailProps) {
  const { tag, totals, firstDate, lastDate, topCategories } = summary;
  const href = `/transactions?tagId=${tag.id}`;
  return (
    <section aria-label={`Tag ${tag.name}`} className={`${CARD_CLASS} flex min-w-0 flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="truncate text-lg font-semibold"># {tag.name}</h2>
          <Link href={href} className="text-sm text-zinc-400 hover:underline">
            {transactionsLabel(tag.transactionCount)}
          </Link>
          {firstDate && lastDate && (
            <span className="text-sm text-zinc-400">
              {fmt.date(firstDate)} – {fmt.date(lastDate)}
            </span>
          )}
        </div>
        <TagMenu tag={tag} tags={tags} />
      </div>

      {totals.length > 0 && (
        <dl className="flex flex-wrap gap-x-10 gap-y-4 border-b border-zinc-100 p-4 dark:border-zinc-800">
          {totals.map((total) => (
            <div key={total.currency} className="flex flex-col gap-1">
              <dt className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                {total.currency}
              </dt>
              <dd className="text-xl font-semibold tabular-nums">
                {fmt.amount(total.spentMinor + total.receivedMinor, { currency: total.currency })}
              </dd>
              <dd className="text-xs text-zinc-500 tabular-nums">
                out {fmt.amount(total.spentMinor)} · in {fmt.amount(total.receivedMinor)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {topCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Mostly
          </span>
          {topCategories.map((category) => (
            <span
              key={category.name}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800"
            >
              {category.name} · {category.count}
            </span>
          ))}
        </div>
      )}

      <h3 className="px-4 pt-3 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
        Recent Transactions
      </h3>
      {recent.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-400">No Transactions carry it.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {recent.map((transaction) => (
            <li key={transaction.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-zinc-500 tabular-nums">
                {fmt.date(transaction.bookingDate)}
              </span>
              <Link
                href={`/transactions/${transaction.id}`}
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {transaction.rawDescription || '(no description)'}
                <span className="block truncate text-xs text-zinc-400">
                  {transaction.accountName} · {transaction.category?.name ?? 'Unclassified'}
                </span>
              </Link>
              <span className="shrink-0 tabular-nums">
                {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tag.transactionCount > recent.length && (
        <Link href={href} className={`${GHOST_BUTTON_CLASS} m-2 self-start`}>
          All {transactionsLabel(tag.transactionCount)} →
        </Link>
      )}
    </section>
  );
}
