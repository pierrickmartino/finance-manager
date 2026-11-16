'use client';

import { useEffect, useRef, useState } from 'react';
import type { Tag } from '@/server/services/tags';
import type { TransactionListItem } from '@/server/services/transactions';

/** The checkbox column, header and rows: room enough to hit the box, nothing more. */
export const CHECK_CELL_CLASS = 'w-0 py-2 pr-1 pl-3 align-top';

export interface RowSelection {
  /** The ticked row ids; may hold rows no longer listed, so read it through the listed rows. */
  ticked: ReadonlySet<string>;
  /** Ticks or unticks a row; with `isRange` (shift held), every row from the last ticked one. */
  tick: (id: string, isChecked: boolean, isRange: boolean) => void;
  /** Ticks or unticks every listed row. */
  tickAll: (isChecked: boolean) => void;
  /**
   * Whether the selection is the list's whole scope (every match of a filter, a whole group)
   * rather than the ticked rows. Any tick or `tickAll` narrows it back to the ticked rows.
   */
  isWholeScope: boolean;
  /** Widens the selection to the whole scope, ticking every listed row; or narrows it back. */
  setWholeScope: (isWhole: boolean) => void;
}

/**
 * The ticked rows of a list for a Bulk edit: one by one, a range anchored on the last ticked
 * row, all of them, or the list's whole scope. `rowIds` are the listed rows, in order. The
 * selection lives in the component only, never in the URL.
 */
export function useRowSelection(rowIds: readonly string[]): RowSelection {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [isWholeScope, setIsWholeScope] = useState(false);

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
    setIsWholeScope(false);
  };

  const tickAll = (isChecked: boolean): void => {
    setTicked(new Set(isChecked ? rowIds : []));
    setAnchorId(null);
    setIsWholeScope(false);
  };

  const setWholeScope = (isWhole: boolean): void => {
    if (isWhole) tickAll(true);
    setIsWholeScope(isWhole);
  };

  return { ticked, tick, tickAll, isWholeScope, setWholeScope };
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

interface RowCheckboxCellProps {
  isTicked: boolean;
  /** `isRange`: shift was held, so the rows from the last ticked one follow. */
  onTick: (isChecked: boolean, isRange: boolean) => void;
  /** Its accessible name, e.g. "Select MIGROS on 03.10.2025". */
  label: string;
}

/** A row's checkbox cell: ticks the row, or with shift held a range up to it. */
export function RowCheckboxCell({ isTicked, onTick, label }: RowCheckboxCellProps) {
  return (
    <td className={CHECK_CELL_CLASS}>
      <input
        type="checkbox"
        checked={isTicked}
        // React's change event for a checkbox is its click, which knows about shift.
        onChange={(event) =>
          onTick(event.target.checked, (event.nativeEvent as MouseEvent).shiftKey)
        }
        aria-label={label}
        className="mt-0.5 accent-accent-ink"
      />
    </td>
  );
}

/** The Tags on these Transactions (their own, not their Split lines'), by name. */
export function tagsOf(transactions: readonly TransactionListItem[]): Pick<Tag, 'id' | 'name'>[] {
  const tags = new Map(transactions.flatMap((t) => t.tags).map((tag) => [tag.id, tag]));
  return [...tags.values()]
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
