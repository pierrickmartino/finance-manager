import { cloneLayout, moveElement, verticalCompactor, type Layout } from 'react-grid-layout/core';

/** The keyboard alternative to dragging a Widget on the Dashboard grid. */

export const GRID_MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
export type GridMoveKey = (typeof GRID_MOVE_KEYS)[number];

export interface GridItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const GRID_COLUMNS = 12;

export function isGridMoveKey(key: string): key is GridMoveKey {
  return (GRID_MOVE_KEYS as readonly string[]).includes(key);
}

const overlapsColumns = (a: GridItem, b: GridItem): boolean => a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * Where the item goes. Left and right move one column. The grid packs Widgets upwards, so a
 * one-row step up or down would snap back: up and down instead swap with the nearest Widget
 * above or below in the same columns.
 */
function target(layout: readonly GridItem[], item: GridItem, key: GridMoveKey) {
  if (key === 'ArrowLeft') return { x: Math.max(0, item.x - 1), y: item.y };
  if (key === 'ArrowRight') return { x: Math.min(GRID_COLUMNS - item.w, item.x + 1), y: item.y };
  const others = layout.filter((other) => other.id !== item.id && overlapsColumns(item, other));
  if (key === 'ArrowUp') {
    const above = others
      .filter((other) => other.y + other.h <= item.y)
      .sort((a, b) => b.y - a.y)[0];
    return above ? { x: item.x, y: above.y } : null;
  }
  const below = others.filter((other) => other.y >= item.y + item.h).sort((a, b) => a.y - b.y)[0];
  return below ? { x: item.x, y: below.y + below.h } : null;
}

/**
 * The layout after moving one Widget with an arrow key, packed like the grid packs it after a
 * drag. Returns the same layout when the Widget can't move that way.
 */
export function moveWidgetByKey(
  layout: readonly GridItem[],
  id: string,
  key: GridMoveKey,
): GridItem[] {
  const item = layout.find((candidate) => candidate.id === id);
  const to = item && target(layout, item, key);
  if (!item || !to || (to.x === item.x && to.y === item.y)) return [...layout];
  const grid: Layout = cloneLayout(layout.map(({ id: i, x, y, w, h }) => ({ i, x, y, w, h })));
  const moving = grid.find((candidate) => candidate.i === id)!;
  const moved = moveElement(grid, moving, to.x, to.y, true, false, 'vertical', GRID_COLUMNS);
  const packed = verticalCompactor.compact(moved, GRID_COLUMNS);
  const byId = new Map(packed.map((entry) => [entry.i, entry]));
  return layout.map((original) => {
    const placed = byId.get(original.id)!;
    return { id: original.id, x: placed.x, y: placed.y, w: placed.w, h: placed.h };
  });
}
