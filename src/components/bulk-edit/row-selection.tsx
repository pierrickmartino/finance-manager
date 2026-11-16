'use client';

import { useEffect, useRef, useState } from 'react';
import type { TransactionListItem } from '@/server/services/transactions';
import type { BulkTag } from './bulk-action-bar';

export interface RowSelection {
  /** The ticked row ids; may hold rows no longer listed, so read it through the listed rows. */
  ticked: ReadonlySet<string>;
  /** Ticks or unticks a row; with `isRange` (shift held), every row from the last ticked one. */
  tick: (id: string, isChecked: boolean, isRange: boolean) => void;
  /** Ticks or unticks every listed row. */
  tickAll: (isChecked: boolean) => void;
}

/**
 * The ticked rows of a list for a Bulk edit: one by one, a range anchored on the last ticked
 * row, or all of them. `rowIds` are the listed rows, in order. The selection lives in the
 * component only, never in the URL.
 */
export function useRowSelection(rowIds: readonly string[]): RowSelection {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const tick = (id: string, isChecked: boolean, isRange: boolean): void => {
    const from = anchorId === null ? -1 : rowIds.indexOf(anchorId);
    const to = rowIds.indexOf(id);
    const range =
      isRange && from !== -1 ? rowIds.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
    setTicked((current) => {
      const next = new Set(current);
      for (const rangeId of range) {
        if (isChecked) next.add(rangeId);
        else next.delete(rangeId);
      }
      return next;
    });
    setAnchorId(id);
  };

  const tickAll = (isChecked: boolean): void => {
    setTicked(new Set(isChecked ? rowIds : []));
    setAnchorId(null);
  };

  return { ticked, tick, tickAll };
}

interface HeaderCheckboxProps {
  selectedCount: number;
  rowCount: number;
  onChange: (isChecked: boolean) => void;
  /** Its accessible name, e.g. "Select every Transaction on this page". */
  label: string;
}

/** Ticks or unticks every listed row; mixed while only some are ticked. */
export function HeaderCheckbox({ selectedCount, rowCount, onChange, label }: HeaderCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const isAll = rowCount > 0 && selectedCount === rowCount;
  const isMixed = selectedCount > 0 && !isAll;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = isMixed;
  }, [isMixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={isAll}
      onChange={() => onChange(!isAll)}
      aria-label={label}
      className="accent-accent-ink"
    />
  );
}

/** The Tags on these Transactions (their own, not their Split lines'), by name. */
export function tagsOf(transactions: readonly TransactionListItem[]): BulkTag[] {
  const tags = new Map(transactions.flatMap((t) => t.tags).map((tag) => [tag.id, tag]));
  return [...tags.values()]
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
