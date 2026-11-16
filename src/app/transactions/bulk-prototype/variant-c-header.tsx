'use client';

/**
 * PROTOTYPE ONLY. Variant C, "Header takeover": no bar of its own. Ticking a row turns the
 * table's own header into the toolbar (count, Select all N, Category ▾ Payee ▾ Tags ▾), so
 * the actions sit right above the rows they change and the page never shifts. Menus drop
 * down under their button and apply on one click; the result replaces the header briefly.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GHOST_BUTTON_CLASS, LINK_BUTTON_CLASS } from '@/components/surface';
import {
  CategoryOptions,
  PayeeOptions,
  TagToggles,
  useDismiss,
  useStubApply,
  type BulkVariantProps,
} from './shared';

type Menu = 'category' | 'payee' | 'tags';

const MENUS: { kind: Menu; label: string }[] = [
  { kind: 'category', label: 'Category' },
  { kind: 'payee', label: 'Payee' },
  { kind: 'tags', label: 'Tags' },
];

interface VariantCHeaderProps extends BulkVariantProps {
  /** The header's tick-all box, kept in its column. */
  checkbox: ReactNode;
  /** The column headers, shown while nothing is selected. */
  columns: ReactNode;
  /** How many columns the toolbar spans beside the checkbox. */
  span: number;
}

export function VariantCHeader(props: VariantCHeaderProps) {
  const { count, isAll, total, pageCount, onWholeScope, onClear, checkbox, columns, span } = props;
  const canWiden = (isAll || props.selected.length === pageCount) && pageCount < total;
  const [open, setOpen] = useState<Menu | null>(null);
  const { apply, isPending, message, dismiss } = useStubApply(count, props.selected, onClear);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(ref, open !== null, close);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, dismiss]);

  const pick = (changes: Parameters<typeof apply>[0], label: string): void => {
    setOpen(null);
    apply(changes, label);
  };

  if (count === 0 && !message) {
    return (
      <tr>
        <th className="w-0 py-2 pr-1 pl-3 align-top">{checkbox}</th>
        {columns}
      </tr>
    );
  }

  return (
    <tr className="bg-accent-tint text-sm text-ink">
      <th className="w-0 py-2 pr-1 pl-3 align-middle">{checkbox}</th>
      <th colSpan={span} className="px-3 py-1.5 text-left font-normal">
        {count === 0 ? (
          <div role="status" className="flex items-center gap-3">
            <span>{message}</span>
            <button type="button" className={LINK_BUTTON_CLASS}>
              Undo
            </button>
            <button type="button" onClick={dismiss} className={`${GHOST_BUTTON_CLASS} ml-auto`}>
              Dismiss
            </button>
          </div>
        ) : (
          <div ref={ref} className="flex flex-wrap items-center gap-1">
            <span className="mr-2 font-medium tabular-nums">
              {isPending ? 'Applying…' : `${count} selected`}
            </span>
            {canWiden && (
              <button
                type="button"
                onClick={() => onWholeScope(!isAll)}
                className={`${LINK_BUTTON_CLASS} mr-3 text-xs`}
              >
                {isAll ? `Select only this page` : `Select all ${total} matching`}
              </button>
            )}
            {MENUS.map(({ kind, label }) => (
              <div key={kind} className="relative">
                <button
                  type="button"
                  disabled={isPending}
                  aria-expanded={open === kind}
                  onClick={() => setOpen(open === kind ? null : kind)}
                  className={`${GHOST_BUTTON_CLASS} ${open === kind ? 'bg-surface text-ink' : ''}`}
                >
                  {label} ▾
                </button>
                {open === kind && (
                  <div className="absolute top-full left-0 z-30 mt-1 rounded-xl border border-rule bg-surface p-2 font-normal shadow-xl">
                    {kind === 'category' && <CategoryOptions lists={props.lists} onPick={pick} />}
                    {kind === 'payee' && <PayeeOptions lists={props.lists} onPick={pick} />}
                    {kind === 'tags' && (
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
              </div>
            ))}
            <button type="button" onClick={onClear} className={`${GHOST_BUTTON_CLASS} ml-auto`}>
              Clear
            </button>
          </div>
        )}
      </th>
    </tr>
  );
}
