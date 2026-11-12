'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { GHOST_BUTTON_CLASS } from '@/components/surface';
import { deleteDashboardWidgetAction, duplicateWidgetAction } from '../../actions';

const TOOLBAR_BUTTON = `${GHOST_BUTTON_CLASS} text-xs`;

/** The class react-grid-layout drags a card by: only its handle starts a drag. */
export const DRAG_HANDLE_CLASS = 'card-drag-handle';

interface CardToolbarProps {
  widgetId: string;
  name: string;
  /** The Widget editor, opened on this Widget. */
  editHref: string;
  /** Whether the card can be dragged (the grid, at `lg` and above). */
  isDraggable: boolean;
  /** Up/down moves in reading order (the one column, below `lg`). */
  moves?: CardMoves;
}

export type MoveDirection = 'up' | 'down';

export interface CardMoves {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: MoveDirection) => void;
}

const ARROWS: Record<MoveDirection, string> = { up: '↑', down: '↓' };

/**
 * Up and down, each disabled at its end of the board (with `aria-disabled`, so the arrow that
 * just moved the card to an end keeps focus). Focus goes back to the arrow after the card has
 * moved in the DOM.
 */
function MoveButtons({ name, moves }: { name: string; moves: CardMoves }) {
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  const buttons = { up, down };
  // A new object per move, so a second move the same way refocuses too.
  const [moved, setMoved] = useState<{ direction: MoveDirection } | null>(null);
  useLayoutEffect(() => {
    if (moved) (moved.direction === 'up' ? up : down).current?.focus();
  }, [moved]);
  const enabled = { up: moves.canMoveUp, down: moves.canMoveDown };

  return (['up', 'down'] as const).map((direction) => (
    <button
      key={direction}
      ref={buttons[direction]}
      type="button"
      aria-label={`Move ${name} ${direction}`}
      aria-disabled={!enabled[direction]}
      onClick={() => {
        if (!enabled[direction]) return;
        moves.onMove(direction);
        setMoved({ direction });
      }}
      className={`${TOOLBAR_BUTTON} aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-transparent`}
    >
      <span aria-hidden>{ARROWS[direction]}</span>
    </button>
  ));
}

/** The strip at the top of a card in Edit mode: drag handle or up/down, Edit, Duplicate, Remove. */
export function CardToolbar({ widgetId, name, editHref, isDraggable, moves }: CardToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={`${name} actions`}
      className="-mt-1 flex flex-wrap items-center gap-1 border-b border-rule pb-2"
    >
      {isDraggable && (
        <button
          type="button"
          aria-label={`Move ${name}`}
          title="Drag to move"
          className={`${DRAG_HANDLE_CLASS} ${TOOLBAR_BUTTON} cursor-grab touch-none select-none active:cursor-grabbing`}
        >
          <span aria-hidden>⠿</span>
        </button>
      )}
      {moves && <MoveButtons name={name} moves={moves} />}
      <span className="flex-1" />
      <Link href={editHref} aria-label={`Edit ${name}`} className={TOOLBAR_BUTTON}>
        Edit
      </Link>
      <ActionForm action={duplicateWidgetAction.bind(null, widgetId)} label={`Duplicate ${name}`}>
        <button type="submit" className={TOOLBAR_BUTTON}>
          Duplicate
        </button>
      </ActionForm>
      <ActionForm
        action={deleteDashboardWidgetAction.bind(null, widgetId)}
        label={`Remove ${name}`}
        confirmMessage={`Remove the Widget "${name}"?`}
      >
        <button type="submit" className={`${TOOLBAR_BUTTON} text-negative hover:text-negative`}>
          Remove
        </button>
      </ActionForm>
    </div>
  );
}
