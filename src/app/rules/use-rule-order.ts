'use client';

import { useState, useTransition, type DragEvent } from 'react';
import type { ActionResult } from '@/server/actions';
import { moved } from './view';

export type ReorderAction = (ids: string[]) => Promise<ActionResult<unknown>>;

export interface RuleOrder {
  /** Rule ids in run order, as shown (updated before the save finishes). */
  order: string[];
  /** The Rule being dragged, if any. */
  dragged: string | null;
  error: string | null;
  isPending: boolean;
  moveBy: (id: string, delta: -1 | 1) => void;
  /** Props for the drag handle of Rule `id`. */
  handleProps: (id: string) => {
    draggable: true;
    onDragStart: (event: DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Props for the drop target of Rule `id`: a dropped Rule takes its place. */
  dropProps: (id: string) => {
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
}

/**
 * The run order (spec 75), with drag-and-drop and move buttons. Each move shows at once and
 * saves the whole order; a failed save puts the previous order back and shows the error.
 */
export function useRuleOrder(initial: readonly string[], reorder: ReorderAction): RuleOrder {
  const [order, setOrder] = useState(() => [...initial]);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = (next: string[]) => {
    const previous = order;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await reorder(next);
      if (!result.ok) {
        setOrder(previous);
        setError(result.error);
      }
    });
  };

  return {
    order,
    dragged,
    error,
    isPending,
    moveBy: (id, delta) => {
      const target = order[order.indexOf(id) + delta];
      if (target) save(moved(order, id, target));
    },
    handleProps: (id) => ({
      draggable: true,
      onDragStart: (event) => {
        event.dataTransfer.setData('text/plain', id);
        event.dataTransfer.effectAllowed = 'move';
        setDragged(id);
      },
      onDragEnd: () => setDragged(null),
    }),
    dropProps: (id) => ({
      onDragOver: (event) => event.preventDefault(),
      onDrop: (event) => {
        event.preventDefault();
        const from = dragged ?? event.dataTransfer.getData('text/plain');
        setDragged(null);
        if (from && from !== id && order.includes(from)) save(moved(order, from, id));
      },
    }),
  };
}
