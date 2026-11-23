'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { DOCK_BUTTON_CLASS, DOCK_CLASS, POPOVER_CLASS } from '@/components/surface';
import { bulkEditAction } from './actions';
import type { BulkEditLists } from './bulk-action-bar';
import { bulkResultMessage } from './dock-options';
import { CategoryPicker, PayeePicker, TagPicker, type DockEdit } from './dock-pickers';
import type { BulkScope } from './scope';

type PickerKind = 'category' | 'payee' | 'tags';

/** The dock's actions, each with the key that opens it while Transactions are selected. */
const ACTIONS: { kind: PickerKind; label: string; dialog: string; key: string }[] = [
  { kind: 'category', label: 'Category', dialog: 'Set Category', key: 'c' },
  { kind: 'payee', label: 'Payee', dialog: 'Set Payee', key: 'p' },
  { kind: 'tags', label: 'Tags', dialog: 'Add or remove Tags', key: 't' },
];

/** Widening a whole ticked page to every Transaction its filter matches, or back. */
export interface DockWiden {
  /** Transactions the filter matches, on every page. */
  total: number;
  /** Whether the selection is the whole filter rather than this page. */
  isAll: boolean;
  onChange: (isAll: boolean) => void;
}

export interface BulkActionDockProps extends BulkEditLists {
  /** The Transactions an action applies to. */
  scope: BulkScope;
  /** How many Transactions the scope holds ("n selected"); the dock hides at 0. */
  count: number;
  /** Each ticked Transaction's Tags; null when the selection reaches beyond the page. */
  selectedTags: { id: string; name: string }[][] | null;
  /** Offered once the whole page is ticked and the filter matches more; null otherwise. */
  widen: DockWiden | null;
  /** Empties the selection: on Clear selection, and after an edit succeeds. */
  onClear: () => void;
}

/** Whether a key press belongs to a text field (a checkbox is no text field). */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio'].includes(target.type);
  return target.isContentEditable || ['TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * The Bulk edit dock: while Transactions are selected, a dark toolbar floats over the bottom of
 * the screen with "n selected", Select all N matching this filter, Category, Payee and Tags.
 * Each action opens a searchable picker above the dock that applies on one click, as one Bulk
 * edit, then clears the selection and reports what changed. Keys: c, p and t open the pickers;
 * Escape closes a picker, or else clears the selection. Its result stays until dismissed or the
 * next selection.
 */
export function BulkActionDock({
  scope,
  count,
  selectedTags,
  widen,
  groups,
  payeeNames,
  tags,
  onClear,
}: BulkActionDockProps) {
  const [open, setOpen] = useState<PickerKind | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const dockRef = useRef<HTMLDivElement>(null);
  const triggers = useRef<Partial<Record<PickerKind, HTMLButtonElement | null>>>({});
  const isSelecting = count > 0;

  const close = (): void => {
    if (open) triggers.current[open]?.focus();
    setOpen(null);
  };

  const clear = (): void => {
    setOpen(null);
    setMessage('');
    setError('');
    onClear();
  };

  const apply = (edit: DockEdit): void => {
    setOpen(null);
    setError('');
    startTransition(async () => {
      const result = await bulkEditAction(scope, edit.changes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(bulkResultMessage(edit.label, result.data));
      onClear();
    });
  };

  // A new selection replaces the last result (adjusted while rendering, not in an effect).
  const [wasSelecting, setWasSelecting] = useState(isSelecting);
  if (isSelecting !== wasSelecting) {
    setWasSelecting(isSelecting);
    if (isSelecting) setMessage('');
  }

  useEffect(() => {
    if (!isSelecting) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (open) close();
        else if (!isTyping(event.target)) clear();
        return;
      }
      const action = ACTIONS.find(({ key }) => key === event.key);
      if (!action || isTyping(event.target) || isPending) return;
      event.preventDefault();
      setOpen(action.kind);
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (open && !dockRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  });

  const isShown = isSelecting || message !== '' || error !== '';
  const openAction = ACTIONS.find(({ kind }) => kind === open);

  return (
    <section
      aria-label="Bulk edit"
      aria-busy={isPending}
      className={`pointer-events-none fixed inset-x-0 bottom-4 z-40 flex-col items-center gap-2 px-4 ${isShown ? 'flex' : 'hidden'}`}
    >
      {error && (
        <p role="alert" className={`${POPOVER_CLASS} pointer-events-auto px-3 text-negative`}>
          {error}
        </p>
      )}
      <div
        className={`${DOCK_CLASS} pointer-events-auto items-center gap-3 px-3 ${message && !isSelecting ? 'flex' : 'hidden'}`}
      >
        <p role="status">{message}</p>
        <button
          type="button"
          onClick={() => setMessage('')}
          aria-label="Dismiss"
          className={DOCK_BUTTON_CLASS}
        >
          ✕
        </button>
      </div>
      {isSelecting && (
        <div ref={dockRef} className="pointer-events-auto relative max-w-full">
          {openAction && (
            <div
              id={`bulk-dock-${openAction.kind}`}
              role="dialog"
              aria-label={openAction.dialog}
              className={`${POPOVER_CLASS} absolute bottom-full left-1/2 mb-2 flex w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2`}
            >
              {openAction.kind === 'category' && <CategoryPicker groups={groups} onApply={apply} />}
              {openAction.kind === 'payee' && (
                <PayeePicker payeeNames={payeeNames} onApply={apply} />
              )}
              {openAction.kind === 'tags' && (
                <TagPicker tags={tags} selectedTags={selectedTags} onApply={apply} />
              )}
            </div>
          )}
          <div className={`${DOCK_CLASS} flex flex-wrap items-center justify-center gap-1`}>
            <button
              type="button"
              onClick={clear}
              aria-label="Clear selection"
              className={`${DOCK_BUTTON_CLASS} px-2 text-ink-soft hover:text-ink`}
            >
              ✕
            </button>
            <span className="pr-2 font-medium tabular-nums">
              {isPending ? 'Applying…' : `${count} selected`}
            </span>
            {widen && (
              <button
                type="button"
                onClick={() => widen.onChange(!widen.isAll)}
                className={`${DOCK_BUTTON_CLASS} px-2 text-xs text-accent-ink underline hover:no-underline`}
              >
                {widen.isAll
                  ? 'Select only this page'
                  : `Select all ${widen.total} matching this filter`}
              </button>
            )}
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-rule-strong sm:block" />
            {ACTIONS.map(({ kind, label, key }) => (
              <button
                key={kind}
                ref={(element) => {
                  triggers.current[kind] = element;
                }}
                type="button"
                disabled={isPending}
                aria-haspopup="dialog"
                aria-expanded={open === kind}
                aria-controls={open === kind ? `bulk-dock-${kind}` : undefined}
                aria-keyshortcuts={key}
                onClick={() => setOpen(open === kind ? null : kind)}
                className={DOCK_BUTTON_CLASS}
              >
                {label}
                <span
                  aria-hidden
                  className="hidden rounded border border-rule-strong px-1 font-mono text-xs leading-4 text-muted sm:inline"
                >
                  {key}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
