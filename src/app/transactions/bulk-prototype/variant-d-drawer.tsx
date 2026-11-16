'use client';

/**
 * PROTOTYPE ONLY. Variant D, "Staged edit panel": the selection opens a panel docked to the
 * right edge. It first says what is selected (count, total per currency, the Categories,
 * Payees and Tags it holds now), then stages several changes at once (Category, Payee, Tags
 * to add and remove) and spells out what Apply will do before it does it, as one Bulk edit.
 */

import { useState } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { FIELD_LABEL_CLASS } from '@/components/form';
import { INPUT_CLASS } from '@/components/named-list';
import {
  BADGE_CLASS,
  GHOST_BUTTON_CLASS,
  LINK_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '@/components/surface';
import { transactionCountLabel } from '@/lib/text';
import type { BulkChanges } from '@/server/services/transactions/bulk-edit';
import type { TransactionListItem } from '@/server/services/transactions';
import { amountClass, categoryText } from '../transaction-display';
import { tagCounts, useStubApply, type BulkVariantProps } from './shared';

const KEEP = '';

/** The values the rows hold for one field, most common first, e.g. Groceries ×3. */
function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function totals(selected: TransactionListItem[]): [string, number][] {
  const sums = new Map<string, number>();
  for (const t of selected) sums.set(t.currency, (sums.get(t.currency) ?? 0) + t.amountMinor);
  return [...sums.entries()];
}

export function VariantDDrawer(props: BulkVariantProps) {
  const { count, isAll, total, pageCount, onWholeScope, onClear, selected, lists } = props;
  const fmt = useFormatter();
  const canWiden = (isAll || selected.length === pageCount) && pageCount < total;
  const [categoryId, setCategoryId] = useState(KEEP);
  const [payee, setPayee] = useState('');
  const [addTags, setAddTags] = useState<string[]>([]);
  const [removeTagIds, setRemoveTagIds] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const { apply, isPending, message, dismiss } = useStubApply(count, selected, () => {
    reset();
    onClear();
  });

  function reset(): void {
    setCategoryId(KEEP);
    setPayee('');
    setAddTags([]);
    setRemoveTagIds([]);
    setTagDraft('');
  }

  if (count === 0) {
    return message ? (
      <p
        role="status"
        className="fixed right-4 bottom-16 z-40 flex items-center gap-3 rounded-lg border border-rule bg-surface px-4 py-2 text-sm shadow-lg"
      >
        {message}
        <button type="button" onClick={dismiss} className={GHOST_BUTTON_CLASS}>
          ✕
        </button>
      </p>
    ) : null;
  }

  const category = lists.groups.flatMap((g) => g.categories).find((c) => c.id === categoryId);
  const counts = tagCounts(selected);
  const presentTags = isAll ? lists.tags : props.removableTags;

  const changes: BulkChanges = {
    ...(category && { categoryId: category.id }),
    ...(payee.trim() && { payeeName: payee.trim() }),
    ...(addTags.length > 0 && { addTagNames: addTags }),
    ...(removeTagIds.length > 0 && { removeTagIds }),
  };
  const plan = [
    category && `set Category to ${category.name}`,
    payee.trim() && `set Payee to ${payee.trim()}`,
    addTags.length > 0 && `add ${addTags.map((t) => `#${t}`).join(', ')}`,
    removeTagIds.length > 0 &&
      `remove ${removeTagIds.map((id) => `#${lists.tags.find((t) => t.id === id)?.name}`).join(', ')}`,
  ].filter(Boolean) as string[];

  const addDraft = (): void => {
    const name = tagDraft.trim();
    if (name && !addTags.includes(name)) setAddTags([...addTags, name]);
    setTagDraft('');
  };

  return (
    <aside
      aria-label="Bulk edit"
      className="fixed top-0 right-0 bottom-0 z-40 flex w-full max-w-sm flex-col border-l border-rule bg-surface shadow-2xl"
    >
      <header className="flex items-start justify-between gap-2 border-b border-rule p-4">
        <div>
          <h2 className="font-display text-xl tracking-tight">
            Edit {transactionCountLabel(count)}
          </h2>
          {canWiden && (
            <button
              type="button"
              onClick={() => onWholeScope(!isAll)}
              className={`${LINK_BUTTON_CLASS} text-xs`}
            >
              {isAll ? 'Only this page' : `Select all ${total} matching this filter`}
            </button>
          )}
        </div>
        <button type="button" onClick={onClear} className={GHOST_BUTTON_CLASS}>
          Close
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm">
        <section className="flex flex-col gap-2 rounded-lg bg-sunken p-3">
          <p className="text-xs text-muted">Selected now</p>
          {isAll ? (
            <p className="text-ink-soft">
              Every Transaction matching the filter, on all pages. Their details aren’t loaded.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 font-medium tabular-nums">
                {totals(selected).map(([currency, sum]) => (
                  <span key={currency} className={amountClass(sum)}>
                    {fmt.amount(sum, { currency })}
                  </span>
                ))}
              </div>
              <Tally label="Category" rows={tally(selected.map(categoryText))} />
              <Tally label="Payee" rows={tally(selected.map((t) => t.payee?.name ?? 'No Payee'))} />
            </>
          )}
        </section>

        <label className={FIELD_LABEL_CLASS}>
          Category
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value={KEEP}>Keep as is</option>
            {lists.groups.map((group) => (
              <optgroup key={group.id} label={group.name}>
                {group.categories.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className={FIELD_LABEL_CLASS}>
          Payee
          <input
            value={payee}
            onChange={(event) => setPayee(event.target.value)}
            list="bulk-prototype-payees"
            autoComplete="off"
            placeholder="Keep as is"
            className={INPUT_CLASS}
          />
          <datalist id="bulk-prototype-payees">
            {lists.payeeNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>

        <div className="flex flex-col gap-2">
          <p className="font-medium">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {presentTags.map((tag) => {
              const isRemoved = removeTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() =>
                    setRemoveTagIds(
                      isRemoved
                        ? removeTagIds.filter((id) => id !== tag.id)
                        : [...removeTagIds, tag.id],
                    )
                  }
                  title={isRemoved ? 'Keep' : 'Remove from all'}
                  className={`${BADGE_CLASS.neutral} ${isRemoved ? 'text-negative line-through' : ''}`}
                >
                  #{tag.name}
                  {!isAll && (
                    <span className="ml-1 text-muted">
                      {counts.get(tag.id) ?? 0}/{count}
                    </span>
                  )}
                  <span className="ml-1">{isRemoved ? '↺' : '×'}</span>
                </button>
              );
            })}
            {addTags.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setAddTags(addTags.filter((t) => t !== name))}
                className={BADGE_CLASS.info}
              >
                + #{name} ×
              </button>
            ))}
          </div>
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addDraft();
              }
            }}
            onBlur={addDraft}
            list="bulk-prototype-tags"
            autoComplete="off"
            placeholder="Add a Tag, then Enter"
            className={INPUT_CLASS}
          />
          <datalist id="bulk-prototype-tags">
            {lists.tags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-rule p-4 text-sm">
        <p className="text-ink-soft">
          {plan.length === 0
            ? 'Nothing staged yet.'
            : `On ${transactionCountLabel(count)}: ${plan.join('; ')}.`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={plan.length === 0 || isPending}
            onClick={() => apply(changes, `${plan.length} change${plan.length === 1 ? '' : 's'}`)}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isPending ? 'Applying…' : 'Apply'}
          </button>
          <button type="button" onClick={reset} className={GHOST_BUTTON_CLASS}>
            Reset
          </button>
        </div>
      </footer>
    </aside>
  );
}

function Tally({ label, rows }: { label: string; rows: [string, number][] }) {
  const shown = rows.slice(0, 3);
  const more = rows.length - shown.length;
  return (
    <p className="text-ink-soft">
      <span className="text-muted">{label}: </span>
      {shown.map(([value, n]) => `${value} ×${n}`).join(', ')}
      {more > 0 && `, +${more} more`}
    </p>
  );
}
