import { chapterKind, type ChapterSource } from './story';

/**
 * The Dashboard's board (ADR-0010): Widget cards placed and sized in whole cells on a
 * 12-column grid of fixed-height rows. Pure geometry over `{ id, x, y, w, h }`, shared by the
 * server and the editor. Every function returns new values and leaves its input as it is.
 */
export const GRID_COLUMNS = 12;
export const MAX_WIDGET_HEIGHT = 40;
/** How many rows the board has: every card ends on or above its last row. */
export const MAX_BOARD_ROWS = 10_000;

export interface Size {
  w: number;
  h: number;
}

/** A Widget's card on the board: its column and row (from 0) and its size in cells. */
export interface Cell extends Size {
  id: string;
  x: number;
  y: number;
}

/** Where a card sits and how big it is, without its id: a Widget's stored layout. */
export type Place = Omit<Cell, 'id'>;

/** The cards of things that may sit on the board (a Widget, a chapter); one without a layout has none. */
export function boardCells(items: readonly { id: string; layout: Place | null }[]): Cell[] {
  return items.flatMap(({ id, layout }) =>
    layout ? [{ id, x: layout.x, y: layout.y, w: layout.w, h: layout.h }] : [],
  );
}

/** A card's place and size alone. */
export function placeOf({ x, y, w, h }: Place): Place {
  return { x, y, w, h };
}

/** Whether two cards sit in the same place at the same size. */
export function isSamePlace(a: Place, b: Place): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** A board as a value: the same cards in any order give the same key. */
export function boardKey(cells: readonly Cell[]): string {
  return JSON.stringify(
    [...cells]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, x, y, w, h }) => [id, x, y, w, h]),
  );
}

/** What a card's size is chosen by: what it shows, coarser than its chapter kind. */
export type SizeKind = 'number' | 'balances' | 'list' | 'chart';

/** The size a new Widget starts at, and the smallest its card can be read at, per kind. */
export const WIDGET_SIZES: Record<SizeKind, { initial: Size; min: Size }> = {
  number: { initial: { w: 4, h: 3 }, min: { w: 2, h: 2 } },
  balances: { initial: { w: 4, h: 6 }, min: { w: 3, h: 4 } },
  list: { initial: { w: 4, h: 8 }, min: { w: 3, h: 5 } },
  chart: { initial: { w: 8, h: 6 }, min: { w: 4, h: 4 } },
};

export function sizeKind(widget: ChapterSource): SizeKind {
  const kind = chapterKind(widget);
  if (kind === 'number') return 'number';
  if (widget.source === 'account_balances') return 'balances';
  return kind === 'ranking' || kind === 'share' ? 'list' : 'chart';
}

export function defaultSize(widget: ChapterSource): Size {
  return { ...WIDGET_SIZES[sizeKind(widget)].initial };
}

export function minimumSize(widget: ChapterSource): Size {
  return { ...WIDGET_SIZES[sizeKind(widget)].min };
}

/** Whole cells, inside the 12 columns and the board's rows, at most the maximum height. */
export function isInBounds(cell: Cell): boolean {
  const { x, y, w, h } = cell;
  return (
    [x, y, w, h].every(Number.isInteger) &&
    x >= 0 &&
    y >= 0 &&
    w >= 1 &&
    h >= 1 &&
    x + w <= GRID_COLUMNS &&
    y + h <= MAX_BOARD_ROWS &&
    h <= MAX_WIDGET_HEIGHT
  );
}

export function meetsMinimum(cell: Size, min: Size): boolean {
  return cell.w >= min.w && cell.h >= min.h;
}

/** Whether two cards share at least one cell (cards that only touch do not). */
export function overlaps(a: Cell, b: Cell): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Every pair of cards that share a cell, as ids in board order. */
export function findOverlaps(cells: readonly Cell[]): [string, string][] {
  return cells.flatMap((a, i) =>
    cells.slice(i + 1).flatMap((b) => (overlaps(a, b) ? [[a.id, b.id] as [string, string]] : [])),
  );
}

/** The cards top to bottom, then left to right: the narrow column's and screen readers' order. */
export function readingOrder<T extends Cell>(cells: readonly T[]): T[] {
  return [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
}

const bottom = (cell: Cell): number => cell.y + cell.h;

/** `cell` moved down just far enough to clear every card in `placed`. */
function clearBelow(cell: Cell, placed: readonly Cell[]): Cell {
  const hits = placed.filter((p) => overlaps(p, cell));
  if (hits.length === 0) return cell;
  return clearBelow({ ...cell, y: Math.max(...hits.map(bottom)) }, placed);
}

/**
 * The board with the cards `ids` kept where they are (each clearing the ones before it, if it
 * must) and every other card in their way pushed down, and anything then in their way too.
 * Nothing moves up, so gaps are kept. Order is kept.
 */
function pushDownAround<T extends Cell>(cells: readonly T[], ids: readonly string[]): T[] {
  const placed: Cell[] = [];
  const moved = new Map<string, number>();
  const fixed = ids.flatMap((id) => cells.filter((cell) => cell.id === id));
  const others = readingOrder(cells.filter((cell) => !ids.includes(cell.id)));
  for (const cell of [...fixed, ...others]) {
    const cleared = clearBelow(cell, placed);
    placed.push(cleared);
    if (cleared.y !== cell.y) moved.set(cell.id, cleared.y);
  }
  return cells.map((cell) => {
    const y = moved.get(cell.id);
    return y === undefined ? cell : { ...cell, y };
  });
}

/**
 * The board with the card `id` kept where it is and every card in its way pushed down, and
 * anything then in their way too. Nothing moves up, so gaps are kept. Order is kept.
 */
export function pushDown<T extends Cell>(cells: readonly T[], id: string): T[] {
  return pushDownAround(cells, [id]);
}

export interface Spot {
  x: number;
  y: number;
}

function isFree(cells: readonly Cell[], spot: Spot, size: Size): boolean {
  const candidate: Cell = { id: '', x: spot.x, y: spot.y, w: size.w, h: size.h };
  return isInBounds(candidate) && !cells.some((cell) => overlaps(cell, candidate));
}

/** The first free spot from row `fromY` down, each row left to right. */
function scanFrom(cells: readonly Cell[], size: Size, fromY: number): Spot {
  for (let y = fromY; ; y += 1) {
    for (let x = 0; x + size.w <= GRID_COLUMNS; x += 1) {
      if (isFree(cells, { x, y }, size)) return { x, y };
    }
  }
}

/**
 * Where a card of `size` goes without covering any other. At the bottom of the board by
 * default: the last row (from the top of the lowest-starting card) is filled before a new one
 * starts, and gaps above it are left alone. Given the card `nextTo`, it is placed on that card's
 * right, else right below it, else in the first free spot under it.
 */
export function firstFreeSpot(cells: readonly Cell[], size: Size, nextTo?: string): Spot {
  const original = nextTo === undefined ? undefined : cells.find((cell) => cell.id === nextTo);
  if (!original) return scanFrom(cells, size, Math.max(0, ...cells.map((cell) => cell.y)));

  const candidates: Spot[] = [
    { x: original.x + original.w, y: original.y },
    { x: Math.min(original.x, GRID_COLUMNS - size.w), y: bottom(original) },
  ];
  const beside = candidates.find((spot) => isFree(cells, spot, size));
  return beside ?? scanFrom(cells, size, bottom(original));
}

/** One cell's step, as the arrow keys give it. */
export type Direction = 'left' | 'right' | 'up' | 'down';

const STEP: Record<Direction, Spot> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/**
 * The board with card `id` changed by `change`, the cards then in its way pushed down; the
 * board as it is when that would push a card past the last row.
 */
function replaceAndPush<T extends Cell>(
  cells: readonly T[],
  id: string,
  change: (cell: T) => T,
): T[] {
  const card = cells.find((cell) => cell.id === id);
  if (!card) return [...cells];
  const changed = change(card);
  if (isSamePlace(changed, card)) return [...cells];
  const pushed = pushDown(
    cells.map((cell) => (cell.id === id ? changed : cell)),
    id,
  );
  return pushed.every((cell) => bottom(cell) <= MAX_BOARD_ROWS) ? pushed : [...cells];
}

/**
 * Card `id` moved one cell, kept inside the board's edges and rows; cards in its way are pushed
 * down.
 */
export function moveCard<T extends Cell>(
  cells: readonly T[],
  id: string,
  direction: Direction,
): T[] {
  const step = STEP[direction];
  return replaceAndPush(cells, id, (card) => ({
    ...card,
    x: clamp(card.x + step.x, 0, GRID_COLUMNS - card.w),
    y: clamp(card.y + step.y, 0, MAX_BOARD_ROWS - card.h),
  }));
}

/**
 * Card `id` grown to at least `min` (as when its chart type changes), moved left if it would
 * pass the right edge; the cards below it are pushed down.
 */
export function growToMinimum<T extends Cell>(cells: readonly T[], id: string, min: Size): T[] {
  return replaceAndPush(cells, id, (card) => {
    const w = clamp(Math.max(card.w, min.w), 1, GRID_COLUMNS);
    return {
      ...card,
      x: Math.min(card.x, GRID_COLUMNS - w),
      w,
      h: clamp(Math.max(card.h, min.h), 1, MAX_WIDGET_HEIGHT),
    };
  });
}

/** Up or down in reading order: how a card moves in the one column below `lg`. */
export type VerticalDirection = Extract<Direction, 'up' | 'down'>;

/**
 * Card `id` swapped with its neighbour in reading order, before it (`up`) or after it (`down`):
 * each takes the other's place (moved left if it would pass the right edge) and keeps it; the
 * one taking the later place goes below the other only if they would overlap, and every other
 * card in their way is pushed down. The board as it is at either end.
 */
export function swapInReadingOrder<T extends Cell>(
  cells: readonly T[],
  id: string,
  direction: VerticalDirection,
): T[] {
  const order = readingOrder(cells);
  const index = order.findIndex((cell) => cell.id === id);
  const card = order[index];
  const other = order[direction === 'up' ? index - 1 : index + 1];
  if (!card || !other) return [...cells];
  const [first, second] = direction === 'up' ? [card, other] : [other, card];
  const placeOf = new Map([
    [card.id, other],
    [other.id, card],
  ]);
  const swapped = cells.map((cell) => {
    const place = placeOf.get(cell.id);
    return place ? { ...cell, x: Math.min(place.x, GRID_COLUMNS - cell.w), y: place.y } : cell;
  });
  return pushDownAround(swapped, [first.id, second.id]);
}

const ACROSS = 3;
const ACROSS_WIDTH = GRID_COLUMNS / ACROSS;

/**
 * An ordered list laid out three across (`w` 4 at `x` 0, 4 and 8), each at its own height,
 * each row starting below the tallest card of the row above.
 */
export function threeAcross(items: readonly { id: string; h: number }[]): Cell[] {
  const rows = Array.from({ length: Math.ceil(items.length / ACROSS) }, (_, row) =>
    items.slice(row * ACROSS, (row + 1) * ACROSS),
  );
  let y = 0;
  return rows.flatMap((row) => {
    const placed = row.map((item, column) => ({
      id: item.id,
      x: column * ACROSS_WIDTH,
      y,
      w: ACROSS_WIDTH,
      h: item.h,
    }));
    y += Math.max(...row.map((item) => item.h));
    return placed;
  });
}

/**
 * Card `id` grown or shrunk one cell from its bottom-right corner, kept between `min` and the
 * board's right edge, last row and maximum height; cards in its way are pushed down.
 */
export function resizeCard<T extends Cell>(
  cells: readonly T[],
  id: string,
  direction: Direction,
  min: Size,
): T[] {
  const step = STEP[direction];
  return replaceAndPush(cells, id, (card) => ({
    ...card,
    w: clamp(card.w + step.x, Math.min(min.w, card.w), GRID_COLUMNS - card.x),
    h: clamp(
      card.h + step.y,
      Math.min(min.h, card.h),
      Math.min(MAX_WIDGET_HEIGHT, MAX_BOARD_ROWS - card.y),
    ),
  }));
}
