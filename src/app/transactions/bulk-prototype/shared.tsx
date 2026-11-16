'use client';

/**
 * PROTOTYPE ONLY (bulk actions redesign, `?variant=` on /transactions). What the variants
 * share: their props, a stubbed apply (nothing is written), outside-click dismissal and the
 * option lists. Throw away with the prototype.
 */

import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import type { BulkEditLists } from '@/components/bulk-edit/bulk-action-bar';
import type { BulkScope } from '@/components/bulk-edit/scope';
import { INPUT_CLASS } from '@/components/named-list';
import { transactionCountLabel } from '@/lib/text';
import type { BulkChanges } from '@/server/services/transactions/bulk-edit';
import type { TransactionListItem } from '@/server/services/transactions';

export interface BulkVariantProps {
  scope: BulkScope;
  /** "n selected": the page's ticked rows, or every match of the filter. */
  count: number;
  /** The selection is the whole filter, beyond this page. */
  isAll: boolean;
  /** The ticked rows on this page. */
  selected: TransactionListItem[];
  /** Rows on this page and matches of the filter, for "Select all N". */
  pageCount: number;
  total: number;
  onWholeScope: (isAll: boolean) => void;
  lists: BulkEditLists;
  removableTags: BulkEditLists['tags'];
  onClear: () => void;
}

const STUB_DELAY_MS = 450;

/** Stubbed Bulk edit: waits, then reports as the real one would. Nothing is written. */
export function useStubApply(count: number, selected: TransactionListItem[], onClear: () => void) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const apply = (changes: BulkChanges, label: string): void => {
    startTransition(async () => {
      await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));
      const leftOut =
        changes.categoryId === undefined
          ? 0
          : selected.filter((transaction) => transaction.splitLines.length > 0).length;
      const leftOutPart = leftOut > 0 ? ` · ${leftOut} split or Transfer left out` : '';
      setMessage(`${label}: ${transactionCountLabel(count - leftOut)} changed${leftOutPart}.`);
      onClear();
    });
  };
  return { apply, isPending, message, dismiss: () => setMessage('') };
}

/** Calls `onClose` on a click outside `ref` or on Escape, while `isOpen`. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, isOpen, onClose]);
}

/** Tags on the ticked rows, with how many of them carry each. */
export function tagCounts(selected: TransactionListItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tag of selected.flatMap((transaction) => transaction.tags)) {
    counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
  }
  return counts;
}

const OPTION_CLASS =
  'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken focus:bg-sunken';

interface FilterableListProps {
  placeholder: string;
  children: (query: string) => React.ReactNode;
}

/** A search box over a scrolling list: type to narrow, click an option to apply at once. */
export function FilterableList({ placeholder, children }: FilterableListProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  return (
    <div className="flex w-72 flex-col gap-2">
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      <div className="max-h-72 overflow-y-auto">{children(query.trim().toLowerCase())}</div>
    </div>
  );
}

interface PickProps {
  lists: BulkEditLists;
  onPick: (changes: BulkChanges, label: string) => void;
}

export function CategoryOptions({ lists, onPick }: PickProps) {
  return (
    <FilterableList placeholder="Find a Category">
      {(query) =>
        lists.groups.map((group) => {
          const categories = group.categories.filter((category) =>
            category.name.toLowerCase().includes(query),
          );
          if (categories.length === 0) return null;
          return (
            <div key={group.id} className="mb-1">
              <p className="px-2 pt-1 text-xs text-muted">{group.name}</p>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onPick({ categoryId: category.id }, `Set ${category.name}`)}
                  className={OPTION_CLASS}
                >
                  {category.name}
                </button>
              ))}
            </div>
          );
        })
      }
    </FilterableList>
  );
}

export function PayeeOptions({ lists, onPick }: PickProps) {
  return (
    <FilterableList placeholder="Find or type a new Payee">
      {(query) => {
        const names = lists.payeeNames.filter((name) => name.toLowerCase().includes(query));
        const isNew = query !== '' && !lists.payeeNames.some((n) => n.toLowerCase() === query);
        return (
          <>
            {isNew && (
              <button
                type="button"
                onClick={() => onPick({ payeeName: query }, `Set ${query}`)}
                className={OPTION_CLASS}
              >
                <span>
                  Create “<span className="font-medium">{query}</span>”
                </span>
                <span className="text-xs text-muted">New</span>
              </button>
            )}
            {names.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onPick({ payeeName: name }, `Set ${name}`)}
                className={OPTION_CLASS}
              >
                {name}
              </button>
            ))}
          </>
        );
      }}
    </FilterableList>
  );
}

interface TagToggleProps extends PickProps {
  selected: TransactionListItem[];
  count: number;
  isAll: boolean;
}

/**
 * Every Tag with a tri-state box: on when every selected row has it, mixed when some do.
 * Ticking adds it to all, unticking removes it from all. Beyond the page, counts are unknown.
 */
export function TagToggles({ lists, onPick, selected, count, isAll }: TagToggleProps) {
  const counts = tagCounts(selected);
  return (
    <FilterableList placeholder="Find or type a new Tag">
      {(query) => {
        const tags = lists.tags.filter((tag) => tag.name.toLowerCase().includes(query));
        const isNew = query !== '' && !lists.tags.some((t) => t.name.toLowerCase() === query);
        return (
          <>
            {isNew && (
              <button
                type="button"
                onClick={() => onPick({ addTagNames: [query] }, `Added ${query}`)}
                className={OPTION_CLASS}
              >
                <span>
                  Create and add #<span className="font-medium">{query}</span>
                </span>
                <span className="text-xs text-muted">New</span>
              </button>
            )}
            {tags.map((tag) => {
              const has = isAll ? 0 : (counts.get(tag.id) ?? 0);
              const isOn = has > 0 && has === count;
              const isMixed = has > 0 && !isOn;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() =>
                    isOn
                      ? onPick({ removeTagIds: [tag.id] }, `Removed ${tag.name}`)
                      : onPick({ addTagNames: [tag.name] }, `Added ${tag.name}`)
                  }
                  className={OPTION_CLASS}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`grid size-4 place-items-center rounded border text-[10px] leading-none ${isOn || isMixed ? 'border-accent-ink bg-accent-ink text-paper' : 'border-rule-strong'}`}
                    >
                      {isOn ? '✓' : isMixed ? '–' : ''}
                    </span>
                    #{tag.name}
                  </span>
                  {has > 0 && (
                    <span className="text-xs text-muted tabular-nums">
                      {has} of {count}
                    </span>
                  )}
                </button>
              );
            })}
          </>
        );
      }}
    </FilterableList>
  );
}
