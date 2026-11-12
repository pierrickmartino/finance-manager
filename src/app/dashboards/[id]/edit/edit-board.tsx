'use client';

import { useState, useSyncExternalStore } from 'react';
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { FieldError } from '@/components/form';
import {
  GRID_COLUMNS,
  MAX_WIDGET_HEIGHT,
  minimumSize,
  readingOrder,
  type Cell,
} from '@/lib/reporting/board';
import {
  BOARD_GAP_PX,
  BOARD_ROW_HEIGHT_PX,
  WidgetBoard,
  type BoardChapter,
} from '../overview/widget-board';
import { WidgetCard } from '../overview/widget-card';
import { CardToolbar, DRAG_HANDLE_CLASS } from './card-toolbar';
import { createPushDownCompactor, layoutCells } from './push-down-compactor';
import { useLayoutSave } from './use-layout-save';

export interface EditorChapter extends BoardChapter {
  /** The Widget editor, opened on this Widget. */
  editHref: string;
}

/** Tailwind's `lg`: the board is the 12-column grid from here up (ADR-0010). */
const WIDE_QUERY = '(min-width: 64rem)';

function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the board is wide enough to be dragged and resized (never while server-rendering). */
function useIsWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/** The chapters at their places on `cells`, in reading order. */
function placedChapters(chapters: readonly EditorChapter[], cells: readonly Cell[]) {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  return readingOrder(cells).flatMap((cell) => {
    const chapter = byId.get(cell.id);
    const { x, y, w, h } = cell;
    return chapter ? [{ ...chapter, layout: { x, y, w, h } }] : [];
  });
}

interface GridEditorProps {
  chapters: EditorChapter[];
  cells: Cell[];
  onChange: (cells: Cell[]) => void;
}

/**
 * The board as a react-grid-layout grid: 12 columns of fixed-height rows, the same gaps as the
 * Dashboard Story, each card dragged by its handle and resized from its bottom-right corner,
 * never under its chapter kind's minimum. Cards in the way are pushed down; nothing packs up.
 */
function GridEditor({ chapters, cells, onChange }: GridEditorProps) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [pushing] = useState(createPushDownCompactor);
  const placed = placedChapters(chapters, cells);
  const layout: Layout = placed.map((chapter) => {
    const min = minimumSize(chapter);
    return {
      i: chapter.id,
      ...chapter.layout,
      minW: min.w,
      minH: min.h,
      maxH: MAX_WIDGET_HEIGHT,
    };
  });
  const begin = (current: Layout, item: { i: string } | null) => {
    if (item) pushing.begin(item.i, current);
  };
  const end = (final: Layout) => {
    pushing.end();
    onChange(layoutCells(final));
  };
  const cards = placed.map((chapter) => (
    <div key={chapter.id}>
      <WidgetCard
        chapter={chapter}
        className="h-full overflow-auto"
        toolbar={
          <CardToolbar
            widgetId={chapter.id}
            name={chapter.name}
            editHref={chapter.editHref}
            isDraggable
          />
        }
      />
    </div>
  ));

  return (
    <div ref={containerRef}>
      {mounted ? (
        <ReactGridLayout
          className="dashboard-board"
          width={width}
          layout={layout}
          gridConfig={{
            cols: GRID_COLUMNS,
            rowHeight: BOARD_ROW_HEIGHT_PX,
            margin: [BOARD_GAP_PX, BOARD_GAP_PX],
            containerPadding: [0, 0],
          }}
          dragConfig={{ handle: `.${DRAG_HANDLE_CLASS}` }}
          resizeConfig={{ handles: ['se'] }}
          compactor={pushing.compactor}
          onDragStart={(current, item) => begin(current, item)}
          onDragStop={(final) => end(final)}
          onResizeStart={(current, item) => begin(current, item)}
          onResizeStop={(final) => end(final)}
        >
          {cards}
        </ReactGridLayout>
      ) : (
        <StaticBoard chapters={placed} isDraggable />
      )}
    </div>
  );
}

/** The board as the Dashboard Story draws it, each card with its toolbar. */
function StaticBoard({
  chapters,
  isDraggable,
}: {
  chapters: EditorChapter[];
  isDraggable: boolean;
}) {
  return (
    <WidgetBoard
      chapters={chapters}
      toolbar={(chapter) => (
        <CardToolbar
          widgetId={chapter.id}
          name={chapter.name}
          editHref={chapter.editHref}
          isDraggable={isDraggable}
        />
      )}
    />
  );
}

interface EditBoardProps {
  dashboardId: string;
  /** In reading order, each with its layout. */
  chapters: EditorChapter[];
}

/**
 * Edit mode's board (GLOSSARY: Edit mode). At `lg` and above it is the grid, dragged and
 * resized in place; each drop or resize saves the whole board at once, without History, with a
 * quiet status and an inline error. Below `lg` it is the Story's one column, not draggable.
 */
export function EditBoard({ dashboardId, chapters }: EditBoardProps) {
  const isWide = useIsWide();
  const [cells, setCells] = useState<Cell[]>(() =>
    chapters.flatMap((chapter) => (chapter.layout ? [{ id: chapter.id, ...chapter.layout }] : [])),
  );
  const { save, isSaving, error } = useLayoutSave(dashboardId, cells);
  const change = (next: Cell[]) => {
    setCells(next);
    save(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-5 items-center gap-3">
        <p role="status" className="text-sm text-muted">
          {isSaving ? 'Saving…' : ''}
        </p>
        {error && <FieldError message={error} />}
      </div>
      {isWide ? (
        <GridEditor chapters={chapters} cells={cells} onChange={change} />
      ) : (
        <StaticBoard chapters={placedChapters(chapters, cells)} isDraggable={false} />
      )}
    </div>
  );
}
