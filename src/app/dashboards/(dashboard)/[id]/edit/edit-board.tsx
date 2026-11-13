'use client';

import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import ReactGridLayout, { useContainerWidth, type Compactor, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { FieldError } from '@/components/form';
import {
  BOARD_GAP_PX,
  BOARD_ROW_HEIGHT_PX,
  boardCells,
  GRID_COLUMNS,
  MAX_WIDGET_HEIGHT,
  minimumSize,
  placeOf,
  readingOrder,
  swapInReadingOrder,
  type Cell,
  type VerticalDirection,
} from '@/lib/reporting/board';
import { minWidthQuery } from '@/lib/breakpoints';
import { keyboardStep } from '@/lib/reporting/board-keys';
import { WidgetBoard, type BoardChapter } from '../overview/widget-board';
import { WidgetCard } from '../overview/widget-card';
import { CardToolbar, DRAG_HANDLE_CLASS } from './card-toolbar';
import { createPushDownCompactor, layoutCells } from './push-down-compactor';
import { useLayoutSave } from './use-layout-save';

export interface EditorChapter extends BoardChapter {
  /** The Widget editor, opened on this Widget. */
  editHref: string;
}

/** Tailwind's `lg`: the board is the 12-column grid from here up (ADR-0010). */
const WIDE_QUERY = minWidthQuery('lg');

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
    return chapter ? [{ ...chapter, layout: placeOf(cell) }] : [];
  });
}

/** The chapters as react-grid-layout items, each kept between its minimum and the tallest card. */
function gridLayout(placed: readonly EditorChapter[]): Layout {
  return placed.flatMap(({ id, layout, ...chapter }) => {
    if (!layout) return [];
    const min = minimumSize(chapter);
    return [{ i: id, ...placeOf(layout), minW: min.w, minH: min.h, maxH: MAX_WIDGET_HEIGHT }];
  });
}

const KEYS_HINT_ID = 'board-keys-hint';

/**
 * Keeps focus on the card a keyboard step moved: the cards are in reading order, so a step can
 * move the focused card's node, which drops its focus.
 */
function useRefocus(): (id: string) => void {
  const [focusId, setFocusId] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const card = document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(focusId.id)}"]`);
    if (card && document.activeElement !== card) card.focus();
  }, [focusId]);
  return (id) => setFocusId({ id });
}

interface BoardChange {
  cells: Cell[];
  onChange: (cells: Cell[]) => void;
  /** Tells a screen reader what a keyboard step did. */
  onAnnounce: (message: string) => void;
}

type KeyStep = (chapter: EditorChapter, event: KeyboardEvent<HTMLElement>) => void;

/** A focused card's arrow keys: a move or resize of one cell, saved, announced, focus kept. */
function useKeyboardStep({ cells, onChange, onAnnounce }: BoardChange): KeyStep {
  const refocus = useRefocus();
  return (chapter, event) => {
    if (event.target !== event.currentTarget) return;
    const result = keyboardStep(cells, chapter.id, event, minimumSize(chapter));
    if (!result) return;
    event.preventDefault();
    onChange(result.cells);
    onAnnounce(result.announcement);
    refocus(chapter.id);
  };
}

/**
 * A card of the grid: focusable to step it from the keyboard, dragged by its toolbar's handle.
 * A plain element, not a component: react-grid-layout gives its direct children their place,
 * class and resize corner.
 */
function arrangeableCard(chapter: EditorChapter, onKeyStep: KeyStep): ReactElement {
  return (
    <div
      key={chapter.id}
      data-card-id={chapter.id}
      role="group"
      tabIndex={0}
      aria-label={`Arrange ${chapter.name}`}
      aria-describedby={KEYS_HINT_ID}
      className="rounded-3xl"
      onKeyDown={(event) => onKeyStep(chapter, event)}
    >
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
  );
}

interface BoardGridProps {
  width: number;
  layout: Layout;
  /** A drag or resize of card `id` starts on the board `layout`. */
  onGestureStart: (id: string, layout: Layout) => void;
  /** The drag or resize ended on the board `layout`. */
  onGestureEnd: (layout: Layout) => void;
  compactor: Compactor;
  children: ReactNode;
}

/** react-grid-layout set to the board: the Dashboard Story's columns, rows and gaps. */
function BoardGrid({
  width,
  layout,
  onGestureStart,
  onGestureEnd,
  compactor,
  children,
}: BoardGridProps) {
  const start = (current: Layout, item: { i: string } | null) => {
    if (item) onGestureStart(item.i, current);
  };
  return (
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
      compactor={compactor}
      onDragStart={start}
      onDragStop={onGestureEnd}
      onResizeStart={start}
      onResizeStop={onGestureEnd}
    >
      {children}
    </ReactGridLayout>
  );
}

interface GridEditorProps extends BoardChange {
  chapters: EditorChapter[];
}

/**
 * The board as a react-grid-layout grid: 12 columns of fixed-height rows, the same gaps as the
 * Dashboard Story, each card dragged by its handle and resized from its bottom-right corner,
 * never under its chapter kind's minimum. Cards in the way are pushed down; nothing packs up.
 */
function GridEditor({ chapters, ...change }: GridEditorProps) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [pushing] = useState(createPushDownCompactor);
  const onKeyStep = useKeyboardStep(change);
  const placed = placedChapters(chapters, change.cells);
  const end = (final: Layout) => {
    pushing.end();
    change.onChange(layoutCells(final));
  };

  return (
    <div ref={containerRef}>
      <p id={KEYS_HINT_ID} className="sr-only">
        Arrow keys move this card one cell, Shift and arrow keys resize it.
      </p>
      {mounted ? (
        <BoardGrid
          width={width}
          layout={gridLayout(placed)}
          onGestureStart={pushing.begin}
          onGestureEnd={end}
          compactor={pushing.compactor}
        >
          {placed.map((chapter) => arrangeableCard(chapter, onKeyStep))}
        </BoardGrid>
      ) : (
        <StaticBoard chapters={placed} isDraggable />
      )}
    </div>
  );
}

interface StaticBoardProps {
  /** In reading order. */
  chapters: EditorChapter[];
  isDraggable: boolean;
  /** Given, each card gets up/down moves that swap it with its reading-order neighbour. */
  onMove?: (id: string, direction: VerticalDirection) => void;
}

/** The board as the Dashboard Story draws it, each card with its toolbar. */
function StaticBoard({ chapters, isDraggable, onMove }: StaticBoardProps) {
  const last = chapters.length - 1;
  return (
    <WidgetBoard
      chapters={chapters}
      toolbar={(chapter) => {
        const index = chapters.indexOf(chapter);
        return (
          <CardToolbar
            widgetId={chapter.id}
            name={chapter.name}
            editHref={chapter.editHref}
            isDraggable={isDraggable}
            moves={
              onMove && {
                canMoveUp: index > 0,
                canMoveDown: index < last,
                onMove: (direction) => onMove(chapter.id, direction),
              }
            }
          />
        );
      }}
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
 * resized in place, or stepped from the keyboard (announced in a live region); each change
 * saves the whole board at once, without History, with a quiet status and an inline error.
 * Below `lg` it is the Story's one column, not draggable: each card moves up or down instead,
 * swapping places with its reading-order neighbour.
 */
export function EditBoard({ dashboardId, chapters }: EditBoardProps) {
  const isWide = useIsWide();
  const [cells, setCells] = useState<Cell[]>(() => boardCells(chapters));
  const { save, isSaving, error } = useLayoutSave(dashboardId, cells);
  const [announcement, setAnnouncement] = useState('');
  // The same words twice (a second press at an edge) change by a trailing space, so they are read again.
  const announce = (message: string) =>
    setAnnouncement((last) => (last === message ? `${message} ` : message));
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
        <p aria-live="polite" data-testid="board-announcement" className="sr-only">
          {announcement}
        </p>
      </div>
      {isWide ? (
        <GridEditor chapters={chapters} cells={cells} onChange={change} onAnnounce={announce} />
      ) : (
        <StaticBoard
          chapters={placedChapters(chapters, cells)}
          isDraggable={false}
          onMove={(id, direction) => change(swapInReadingOrder(cells, id, direction))}
        />
      )}
    </div>
  );
}
