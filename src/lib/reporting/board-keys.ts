/**
 * Arranging the board from the keyboard (ADR-0010): an arrow key moves a focused card one cell,
 * Shift+arrow resizes it one cell from its bottom-right corner, and each step says what it did.
 */
import {
  type Cell,
  type Direction,
  isSamePlace,
  MAX_WIDGET_HEIGHT,
  moveCard,
  resizeCard,
  type Size,
} from './board';

/** The parts of a key press a step is read from. */
export interface StepKey {
  key: string;
  shiftKey: boolean;
}

export interface KeyboardStep {
  /** The board after the step (the same places when nothing could change). */
  cells: Cell[];
  /** What to tell a screen reader. */
  announcement: string;
}

const DIRECTION_BY_KEY: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** Why a move in each direction did nothing. */
const MOVE_BLOCKED: Record<Direction, string> = {
  left: 'Already at the left edge',
  right: 'Already at the right edge',
  up: 'Already at the top',
  down: 'Already at the bottom',
};

/** Why a resize in each direction did nothing (down: the card is as tall as a card can be). */
const RESIZE_BLOCKED: Record<Direction, string> = {
  left: 'Already as narrow as it can be',
  right: 'Already at the right edge',
  up: 'Already as short as it can be',
  down: 'Already as tall as it can be',
};

/** Why a step changed nothing: a step down short of the tallest card met the last row. */
function blockedReason(card: Cell, direction: Direction, isResize: boolean): string {
  if (!isResize) return MOVE_BLOCKED[direction];
  if (direction === 'down' && card.h < MAX_WIDGET_HEIGHT) return MOVE_BLOCKED.down;
  return RESIZE_BLOCKED[direction];
}

/** Card `id` stepped by `key` (never under `min`), or null when `key` is not an arrow. */
export function keyboardStep(
  cells: readonly Cell[],
  id: string,
  key: StepKey,
  min: Size,
): KeyboardStep | null {
  const direction = DIRECTION_BY_KEY[key.key];
  const before = cells.find((cell) => cell.id === id);
  if (!direction || !before) return null;
  const next = key.shiftKey
    ? resizeCard(cells, id, direction, min)
    : moveCard(cells, id, direction);
  const card = next.find((cell) => cell.id === id) ?? before;
  if (isSamePlace(card, before)) {
    return { cells: next, announcement: blockedReason(card, direction, key.shiftKey) };
  }
  const announcement = key.shiftKey
    ? `Resized to ${card.w} by ${card.h}`
    : `Moved to column ${card.x + 1}, row ${card.y + 1}`;
  return { cells: next, announcement };
}
