'use client';

import 'react-grid-layout/css/styles.css';
import { useState, useTransition, type ReactNode } from 'react';
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout';
import { FieldError } from '@/components/form';
import type { WidgetLayout } from '@/server/services/reporting';
import { saveLayoutAction } from '../actions';

/** Grid geometry. Widths are in twelfths; one height unit is ROW_HEIGHT pixels. */
const COLUMNS = 12;
const ROW_HEIGHT = 40;
const MARGIN = [16, 16] as const;
/** Below this width the Widgets stack in one column, in layout order, without dragging. */
const STACKED_BELOW = 768;

export interface GridWidget {
  id: string;
  title: string;
  layout: WidgetLayout;
  /** The title and the Widget's actions. */
  header: ReactNode;
  /** The visualisation. */
  body: ReactNode;
}

function toGrid(widgets: GridWidget[]): Layout {
  return widgets.map(({ id, layout }) => ({ i: id, ...layout, minW: 2, minH: 3 }));
}

function sameLayout(a: WidgetLayout, b: WidgetLayout): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * The Dashboard grid: Widgets move by their handle and resize from their corner; every change
 * is saved (without History). On a phone the Widgets stack, full width, in the same order.
 */
export function DashboardGrid({
  dashboardId,
  widgets,
}: {
  dashboardId: string;
  widgets: GridWidget[];
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [layouts, setLayouts] = useState<Record<string, WidgetLayout>>(() =>
    Object.fromEntries(widgets.map((widget) => [widget.id, widget.layout])),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const save = (layout: Layout) => {
    const next = Object.fromEntries(
      layout.map(({ i, x, y, w, h }) => [i, { x, y, w, h } satisfies WidgetLayout]),
    );
    const changed = Object.entries(next).filter(
      ([id, item]) => !layouts[id] || !sameLayout(layouts[id], item),
    );
    setLayouts(next);
    if (changed.length === 0) return;
    startSaving(async () => {
      const result = await saveLayoutAction(
        dashboardId,
        changed.map(([widgetId, item]) => ({ widgetId, layout: item })),
      );
      setError(result.ok ? null : result.error);
    });
  };

  const placed = widgets.map((widget) => ({
    ...widget,
    layout: layouts[widget.id] ?? widget.layout,
  }));
  const isStacked = mounted && width < STACKED_BELOW;

  const card = (widget: GridWidget, isDraggable: boolean) => (
    <section
      key={widget.id}
      aria-label={widget.title}
      data-layout={`${widget.layout.x},${widget.layout.y},${widget.layout.w},${widget.layout.h}`}
      className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      style={isStacked ? { height: Math.max(widget.layout.h, 6) * ROW_HEIGHT } : undefined}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        {isDraggable && (
          <button
            type="button"
            aria-label={`Move ${widget.title}`}
            title="Drag to move"
            className="widget-drag-handle cursor-grab touch-none text-zinc-400 active:cursor-grabbing"
          >
            ⠿
          </button>
        )}
        {widget.header}
      </div>
      <div className="min-h-0 flex-1 p-3">{widget.body}</div>
    </section>
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {error && <FieldError message={error} />}
      <p role="status" className="sr-only">
        {isSaving ? 'Saving layout…' : ''}
      </p>
      {!mounted ? null : isStacked ? (
        <div className="flex flex-col gap-4">
          {[...placed]
            .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
            .map((widget) => card(widget, false))}
        </div>
      ) : (
        <ReactGridLayout
          width={width}
          layout={toGrid(placed)}
          gridConfig={{
            cols: COLUMNS,
            rowHeight: ROW_HEIGHT,
            margin: MARGIN,
            containerPadding: [0, 0],
          }}
          dragConfig={{ enabled: true, handle: '.widget-drag-handle' }}
          resizeConfig={{ enabled: true, handles: ['se'] }}
          onDragStop={(layout) => save(layout)}
          onResizeStop={(layout) => save(layout)}
        >
          {placed.map((widget) => card(widget, true))}
        </ReactGridLayout>
      )}
    </div>
  );
}
