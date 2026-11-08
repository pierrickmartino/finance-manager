'use client';

import type { DragControls } from 'motion/react';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { GHOST_BUTTON_CLASS } from '@/components/surface';
import { deleteDashboardWidgetAction, duplicateWidgetAction } from '../../actions';
import { STORY } from '../story/palette';

const BAR_BUTTON = `${GHOST_BUTTON_CLASS} text-xs`;

/** The id of a chapter's move button, so focus can follow the chapter it moved. */
export function moveButtonId(widgetId: string, delta: -1 | 1): string {
  return `move-${delta < 0 ? 'up' : 'down'}-${widgetId}`;
}

interface EditBarProps {
  widgetId: string;
  name: string;
  editHref: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  dragControls: DragControls;
}

/** The ruled strip above a chapter in Edit mode: drag, move, edit, duplicate, delete. */
export function EditBar({
  widgetId,
  name,
  editHref,
  isFirst,
  isLast,
  onMove,
  dragControls,
}: EditBarProps) {
  return (
    <div
      role="toolbar"
      aria-label={`${name} actions`}
      className="flex flex-wrap items-center gap-1 border-t pt-2"
      style={{ borderColor: STORY.ink }}
    >
      {/* Pointer only, on wide screens: the arrows do the same from a keyboard or a phone. */}
      <span
        aria-hidden
        title="Drag to move"
        onPointerDown={(event) => dragControls.start(event)}
        className="hidden cursor-grab touch-none px-1 text-faint select-none active:cursor-grabbing md:inline"
      >
        ⠿
      </span>
      <button
        type="button"
        id={moveButtonId(widgetId, -1)}
        aria-label={`Move ${name} up`}
        disabled={isFirst}
        onClick={() => onMove(-1)}
        className={BAR_BUTTON}
      >
        ↑
      </button>
      <button
        type="button"
        id={moveButtonId(widgetId, 1)}
        aria-label={`Move ${name} down`}
        disabled={isLast}
        onClick={() => onMove(1)}
        className={BAR_BUTTON}
      >
        ↓
      </button>
      <span className="flex-1" />
      <Link href={editHref} aria-label={`Edit ${name}`} className={BAR_BUTTON}>
        Edit
      </Link>
      <ActionForm action={duplicateWidgetAction.bind(null, widgetId)} label={`Duplicate ${name}`}>
        <button type="submit" className={BAR_BUTTON}>
          Duplicate
        </button>
      </ActionForm>
      <ActionForm
        action={deleteDashboardWidgetAction.bind(null, widgetId)}
        label={`Delete ${name}`}
        confirmMessage={`Delete the Widget "${name}"?`}
      >
        <button type="submit" className={`${BAR_BUTTON} text-negative hover:text-negative`}>
          Delete
        </button>
      </ActionForm>
    </div>
  );
}
