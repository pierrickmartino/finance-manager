import { cloneLayout, type Compactor, type Layout } from 'react-grid-layout';
import { pushDown, type Cell } from '@/lib/reporting/board';

/** A react-grid-layout layout as board cells. */
export function layoutCells(layout: Layout): Cell[] {
  return layout.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h }));
}

export interface PushDownCompactor {
  compactor: Compactor;
  /** A drag or resize of card `id` starts on the board `layout`. */
  begin: (id: string, layout: Layout) => void;
  /** The gesture ended; the board it left is final. */
  end: () => void;
}

/**
 * Lets react-grid-layout draw the board's own rule while a card is dragged or resized (ADR-0010):
 * nothing packs upward, and the cards in the active card's way are pushed down. Each step starts
 * again from the board as it was when the gesture began, so a card that only passes over
 * another leaves it where it was, and what the grid shows is what gets saved. Paired with
 * `allowOverlap`, so react-grid-layout moves nothing itself.
 */
export function createPushDownCompactor(): PushDownCompactor {
  let active: { id: string; start: Cell[] } | null = null;
  const compactor: Compactor = {
    type: null,
    allowOverlap: true,
    compact(layout) {
      const moved = active && layout.find((item) => item.i === active?.id);
      if (!active || !moved) return cloneLayout(layout);
      const { id } = active;
      const { x, y, w, h } = moved;
      const cells = active.start.map((cell) => (cell.id === id ? { ...cell, x, y, w, h } : cell));
      const placed = new Map(pushDown(cells, id).map((cell) => [cell.id, cell]));
      return layout.map((item) => {
        const cell = placed.get(item.i);
        return cell ? { ...item, x: cell.x, y: cell.y, w: cell.w, h: cell.h } : { ...item };
      });
    },
  };
  return {
    compactor,
    begin: (id, layout) => {
      active = { id, start: layoutCells(layout) };
    },
    end: () => {
      active = null;
    },
  };
}
