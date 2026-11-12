'use client';

import Link from 'next/link';
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
}

/** The strip at the top of a card in Edit mode: drag handle, Edit, Duplicate, Remove. */
export function CardToolbar({ widgetId, name, editHref, isDraggable }: CardToolbarProps) {
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
