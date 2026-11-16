'use client';

/**
 * PROTOTYPE ONLY. Variant B, "Floating dock": the selection summons a dark dock that floats
 * over the list at the bottom of the screen, wherever you have scrolled. Each action opens a
 * searchable popover above the dock and applies on one click: no Apply button. Tags are
 * tri-state toggles. Keys: c Category, p Payee, t Tags, Esc clears.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CategoryOptions,
  PayeeOptions,
  TagToggles,
  useDismiss,
  useStubApply,
  type BulkVariantProps,
} from './shared';

type Popover = 'category' | 'payee' | 'tags';

const ACTIONS: { kind: Popover; label: string; key: string }[] = [
  { kind: 'category', label: 'Category', key: 'c' },
  { kind: 'payee', label: 'Payee', key: 'p' },
  { kind: 'tags', label: 'Tags', key: 't' },
];

export function VariantBDock(props: BulkVariantProps) {
  const { count, isAll, total, pageCount, onWholeScope, onClear } = props;
  const canWiden = (isAll || props.selected.length === pageCount) && pageCount < total;
  const [open, setOpen] = useState<Popover | null>(null);
  const { apply, isPending, message, dismiss } = useStubApply(count, props.selected, onClear);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(ref, open !== null, close);

  useEffect(() => {
    if (count === 0) return;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement;
      const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
      if (!isCheckbox && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const action = ACTIONS.find((a) => a.key === event.key);
      if (action) {
        event.preventDefault();
        setOpen(action.kind);
      }
      if (event.key === 'Escape' && open === null) onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, open, onClear]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [message, dismiss]);

  const pick = (changes: Parameters<typeof apply>[0], label: string): void => {
    setOpen(null);
    apply(changes, label);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 flex flex-col items-center gap-2 px-4">
      {count === 0 && message && (
        <p
          role="status"
          className="pointer-events-auto flex items-center gap-3 rounded-lg bg-ink px-4 py-2 text-sm text-paper shadow-lg"
        >
          {message}
          <button type="button" className="font-medium text-accent underline">
            Undo
          </button>
        </p>
      )}
      {count > 0 && (
        <div ref={ref} className="pointer-events-auto relative">
          {open && (
            <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-xl border border-rule bg-surface p-2 shadow-xl">
              {open === 'category' && <CategoryOptions lists={props.lists} onPick={pick} />}
              {open === 'payee' && <PayeeOptions lists={props.lists} onPick={pick} />}
              {open === 'tags' && (
                <TagToggles
                  lists={props.lists}
                  onPick={pick}
                  selected={props.selected}
                  count={count}
                  isAll={isAll}
                />
              )}
            </div>
          )}
          <div
            aria-label="Bulk edit"
            aria-busy={isPending}
            className="flex items-center gap-1 rounded-xl bg-ink p-1.5 text-sm text-paper shadow-2xl"
          >
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear selection"
              className="rounded-md px-2 py-1 text-paper/70 hover:bg-paper/10 hover:text-paper"
            >
              ✕
            </button>
            <span className="pr-2 font-medium tabular-nums">
              {isPending ? 'Applying…' : `${count} selected`}
            </span>
            {canWiden && (
              <button
                type="button"
                onClick={() => onWholeScope(!isAll)}
                className="mr-1 rounded-md px-2 py-1 text-xs text-accent hover:bg-paper/10"
              >
                {isAll ? 'Only this page' : `Select all ${total}`}
              </button>
            )}
            <span aria-hidden className="mx-1 h-5 w-px bg-paper/20" />
            {ACTIONS.map(({ kind, label, key }) => (
              <button
                key={kind}
                type="button"
                disabled={isPending}
                aria-expanded={open === kind}
                aria-keyshortcuts={key}
                onClick={() => setOpen(open === kind ? null : kind)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium hover:bg-paper/10 disabled:opacity-50 ${open === kind ? 'bg-paper/15' : ''}`}
              >
                {label}
                <span
                  aria-hidden
                  className="rounded border border-paper/25 px-1 font-mono text-xs leading-4 text-paper/70"
                >
                  {key}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
