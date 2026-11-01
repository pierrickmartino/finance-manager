/*
 * PROTOTYPE — throwaway. Variant C, "Cloud + tidy-up": a "Tidy up" strip first (likely
 * duplicates with a one-click merge, unused Tags with a one-click delete), then every Tag as a
 * chip sized by use; picking one (`?tag=`) opens it in a strip under the cloud.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import { CARD_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { deleteTagAction, mergeTagAction } from './actions';
import {
  likelyDuplicates,
  tagHref,
  transactionsLabel,
  type DuplicatePair,
  type TagSummary,
} from './prototype-data';
import { NewTagForm, TagMenu } from './prototype-tag-menu';

export const VARIANT_C_NAME = 'Cloud + tidy-up';

const CHIP_SIZES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'];

interface VariantCProps {
  summaries: TagSummary[];
  selected: TagSummary | undefined;
  fmt: Formatter;
}

export function VariantC({ summaries, selected, fmt }: VariantCProps) {
  const tags = summaries.map((s) => s.tag);
  const duplicates = likelyDuplicates(tags);
  const unused = tags.filter((tag) => tag.transactionCount === 0);
  const max = Math.max(1, ...tags.map((tag) => tag.transactionCount));
  const sizeOf = (count: number) =>
    CHIP_SIZES[Math.round((Math.log1p(count) / Math.log1p(max)) * (CHIP_SIZES.length - 1))]!;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-sm text-zinc-500">Bigger means more Transactions.</p>
        </div>
        <NewTagForm className="flex items-center gap-1" />
      </header>

      {(duplicates.length > 0 || unused.length > 0) && (
        <section
          aria-label="Tidy up"
          className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30"
        >
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Tidy up · {duplicates.length + unused.length}
          </h2>
          {duplicates.map((pair) => (
            <DuplicateRow key={`${pair.source.id}-${pair.target.id}`} pair={pair} />
          ))}
          {unused.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Unused:</span>
              {unused.map((tag) => (
                <ActionForm
                  key={tag.id}
                  action={deleteTagAction.bind(null, tag.id)}
                  label={`Delete ${tag.name}`}
                  confirmMessage={`Delete "${tag.name}"?`}
                >
                  <button
                    type="submit"
                    className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs hover:border-rose-400 hover:text-rose-600 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {tag.name} ✕
                  </button>
                </ActionForm>
              ))}
            </div>
          )}
        </section>
      )}

      <div className={`${CARD_CLASS} flex flex-wrap items-baseline gap-x-3 gap-y-2 p-6`}>
        {tags.length === 0 && <p className="text-sm text-zinc-400">No Tags yet.</p>}
        {tags.map((tag) => {
          const isActive = tag.id === selected?.tag.id;
          return (
            <Link
              key={tag.id}
              href={isActive ? tagHref('C', {}) : tagHref('C', { tag: tag.id })}
              scroll={false}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-full px-3 py-1 font-medium ${sizeOf(tag.transactionCount)} ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : tag.transactionCount === 0
                    ? 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
              }`}
            >
              #{tag.name}
              <sup className="ml-1 text-[0.6em] opacity-60">{tag.transactionCount}</sup>
            </Link>
          );
        })}
      </div>

      {selected && <SelectedStrip summary={selected} tags={tags} fmt={fmt} />}
    </section>
  );
}

function DuplicateRow({ pair: { source, target } }: { pair: DuplicatePair }) {
  return (
    <ActionForm
      action={mergeTagAction.bind(null, source.id)}
      label={`Merge ${source.name} into ${target.name}`}
      confirmMessage={`Merge "${source.name}" into "${target.name}"?`}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <input type="hidden" name="targetId" value={target.id} />
      <span>
        <strong>{source.name}</strong> ({source.transactionCount}) looks like{' '}
        <strong>{target.name}</strong> ({target.transactionCount})
      </span>
      <button type="submit" className={GHOST_BUTTON_CLASS}>
        Merge into {target.name}
      </button>
    </ActionForm>
  );
}

interface SelectedStripProps {
  summary: TagSummary;
  tags: TagSummary['tag'][];
  fmt: Formatter;
}

function SelectedStrip({ summary, tags, fmt }: SelectedStripProps) {
  const { tag, totals, firstDate, lastDate, topCategories } = summary;
  return (
    <section
      aria-label={`Tag ${tag.name}`}
      className={`${CARD_CLASS} flex flex-wrap items-center gap-x-8 gap-y-3 p-4`}
    >
      <h2 className="text-lg font-semibold">#{tag.name}</h2>
      <Fact label="Used on">
        <Link href={`/transactions?tagId=${tag.id}`} className="hover:underline">
          {transactionsLabel(tag.transactionCount)}
        </Link>
      </Fact>
      {firstDate && lastDate && (
        <Fact label="Period">
          {fmt.date(firstDate)} – {fmt.date(lastDate)}
        </Fact>
      )}
      {totals.map((total) => (
        <Fact key={total.currency} label={`Net ${total.currency}`}>
          {fmt.amount(total.spentMinor + total.receivedMinor)}
        </Fact>
      ))}
      {topCategories.length > 0 && (
        <Fact label="Mostly">{topCategories.map((c) => c.name).join(', ')}</Fact>
      )}
      <div className="ml-auto">
        <TagMenu tag={tag} tags={tags} />
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{label}</span>
      <span className="text-sm tabular-nums">{children}</span>
    </div>
  );
}
