'use client';

import { useRef, useState, useTransition } from 'react';
import { boardKey, type Cell } from '@/lib/reporting/board';
import { saveDashboardLayoutAction } from '../../actions';

export interface LayoutSave {
  /** Saves the whole board, unless it is the board last saved. */
  save: (cells: readonly Cell[]) => void;
  isSaving: boolean;
  error: string | null;
}

/**
 * Saves a Dashboard's board after each drop, resize or keyboard step, straight away and without
 * History; the last save wins (ADR-0010).
 */
export function useLayoutSave(dashboardId: string, initial: readonly Cell[]): LayoutSave {
  const [initialKey] = useState(() => boardKey(initial));
  const savedKey = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const save = (cells: readonly Cell[]) => {
    const key = boardKey(cells);
    if (key === (savedKey.current ?? initialKey)) return;
    savedKey.current = key;
    const board = cells.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
    startSaving(async () => {
      const result = await saveDashboardLayoutAction(dashboardId, board);
      setError(result.ok ? null : result.error);
    });
  };
  return { save, isSaving, error };
}
