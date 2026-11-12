import { describe, expect, it } from 'vitest';
import type { Visualisation, WidgetSource } from '@/server/services/reporting';
import {
  type Cell,
  defaultSize,
  findOverlaps,
  firstFreeSpot,
  growToMinimum,
  isInBounds,
  meetsMinimum,
  minimumSize,
  moveCard,
  resizeCard,
  pushDown,
  readingOrder,
  sizeKind,
  threeAcross,
  WIDGET_SIZES,
} from './board';

const cell = (id: string, x: number, y: number, w: number, h: number): Cell => ({ id, x, y, w, h });

const columns = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ key: `c${i}`, label: `C${i}`, isPartial: false }));

/** Just what a Widget's chapter kind is read from. */
const widget = (source: WidgetSource, visualisation: Visualisation, seriesCount = 1) => ({
  source,
  visualisation,
  data: { columns: columns(seriesCount) } as never,
});

describe('Widget sizes', () => {
  it('sizes a Widget by what its card shows', () => {
    expect(sizeKind(widget('query', 'number'))).toBe('number');
    expect(sizeKind(widget('account_balances', 'table'))).toBe('balances');
    expect(sizeKind(widget('query', 'donut'))).toBe('list');
    expect(sizeKind(widget('query', 'stacked_bar', 5))).toBe('list');
    expect(sizeKind(widget('query', 'line'))).toBe('chart');
    expect(sizeKind(widget('query', 'stacked_bar', 2))).toBe('chart');
  });

  it('gives each kind its default and minimum size', () => {
    expect(defaultSize(widget('query', 'number'))).toEqual({ w: 4, h: 3 });
    expect(defaultSize(widget('account_balances', 'table'))).toEqual({ w: 4, h: 6 });
    expect(defaultSize(widget('query', 'donut'))).toEqual({ w: 4, h: 8 });
    expect(defaultSize(widget('query', 'line'))).toEqual({ w: 8, h: 6 });
    expect(minimumSize(widget('query', 'line'))).toEqual({ w: 4, h: 4 });
  });

  it('keeps every minimum at or below its default, and within three across', () => {
    for (const { initial, min } of Object.values(WIDGET_SIZES)) {
      expect(min.w).toBeLessThanOrEqual(initial.w);
      expect(min.h).toBeLessThanOrEqual(initial.h);
      expect(min.w).toBeLessThanOrEqual(4);
    }
  });
});

describe('isInBounds', () => {
  it('accepts a card inside the 12 columns, up to the full width and the maximum height', () => {
    expect(isInBounds(cell('a', 0, 0, 12, 40))).toBe(true);
    expect(isInBounds(cell('a', 8, 99, 4, 1))).toBe(true);
  });

  it('refuses a card past the right edge, above row 0, too tall, empty or off the cells', () => {
    expect(isInBounds(cell('a', 9, 0, 4, 3))).toBe(false);
    expect(isInBounds(cell('a', -1, 0, 4, 3))).toBe(false);
    expect(isInBounds(cell('a', 0, -1, 4, 3))).toBe(false);
    expect(isInBounds(cell('a', 0, 0, 4, 41))).toBe(false);
    expect(isInBounds(cell('a', 0, 0, 0, 3))).toBe(false);
    expect(isInBounds(cell('a', 0.5, 0, 4, 3))).toBe(false);
  });
});

describe('meetsMinimum', () => {
  it('needs both the width and the height of the minimum', () => {
    expect(meetsMinimum(cell('a', 0, 0, 4, 4), { w: 4, h: 4 })).toBe(true);
    expect(meetsMinimum(cell('a', 0, 0, 3, 9), { w: 4, h: 4 })).toBe(false);
    expect(meetsMinimum(cell('a', 0, 0, 9, 3), { w: 4, h: 4 })).toBe(false);
  });
});

describe('findOverlaps', () => {
  it('finds no overlap on an empty board or between cards that only touch', () => {
    expect(findOverlaps([])).toEqual([]);
    expect(
      findOverlaps([cell('a', 0, 0, 4, 3), cell('b', 4, 0, 4, 3), cell('c', 0, 3, 8, 2)]),
    ).toEqual([]);
  });

  it('names each pair of cards sharing a cell', () => {
    expect(
      findOverlaps([cell('a', 0, 0, 4, 3), cell('b', 3, 2, 4, 3), cell('c', 6, 0, 2, 9)]),
    ).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });
});

describe('readingOrder', () => {
  it('reads the board top to bottom, then left to right', () => {
    const board = [cell('c', 0, 5, 4, 3), cell('b', 8, 0, 4, 3), cell('a', 0, 0, 8, 5)];
    expect(readingOrder(board).map((card) => card.id)).toEqual(['a', 'b', 'c']);
    expect(board.map((card) => card.id)).toEqual(['c', 'b', 'a']);
    expect(readingOrder([])).toEqual([]);
  });
});

describe('pushDown', () => {
  it('pushes the card in the way below the placed card, and what is under it further down', () => {
    const board = [
      cell('placed', 0, 0, 6, 4),
      cell('inWay', 2, 2, 4, 3),
      cell('under', 2, 5, 4, 2),
      cell('aside', 8, 0, 4, 9),
    ];
    expect(pushDown(board, 'placed')).toEqual([
      cell('placed', 0, 0, 6, 4),
      cell('inWay', 2, 4, 4, 3),
      cell('under', 2, 7, 4, 2),
      cell('aside', 8, 0, 4, 9),
    ]);
  });

  it('keeps gaps: nothing moves up, and a board with no collision is unchanged', () => {
    const board = [cell('a', 0, 0, 4, 3), cell('b', 0, 10, 4, 3)];
    expect(pushDown(board, 'a')).toEqual(board);
    expect(pushDown([], 'a')).toEqual([]);
  });

  it('pushes a card the placed card was dropped onto the lower half of', () => {
    const board = [cell('above', 0, 0, 4, 6), cell('placed', 0, 4, 4, 2)];
    expect(pushDown(board, 'placed')).toEqual([
      cell('above', 0, 6, 4, 6),
      cell('placed', 0, 4, 4, 2),
    ]);
  });

  it('leaves the given board as it is', () => {
    const board = [cell('placed', 0, 0, 4, 4), cell('b', 0, 1, 4, 4)];
    pushDown(board, 'placed');
    expect(board[1]).toEqual(cell('b', 0, 1, 4, 4));
  });
});

describe('firstFreeSpot', () => {
  const size = { w: 4, h: 3 };

  it('starts an empty board at its first cell', () => {
    expect(firstFreeSpot([], size)).toEqual({ x: 0, y: 0 });
  });

  it('fills the last row before starting a new one below the board', () => {
    const twoOnARow = [cell('a', 0, 0, 4, 3), cell('b', 4, 0, 4, 5)];
    expect(firstFreeSpot(twoOnARow, size)).toEqual({ x: 8, y: 0 });
    const fullRow = [...twoOnARow, cell('c', 8, 0, 4, 2)];
    expect(firstFreeSpot(fullRow, size)).toEqual({ x: 8, y: 2 });
    expect(firstFreeSpot(fullRow, { w: 12, h: 1 })).toEqual({ x: 0, y: 5 });
  });

  it('leaves the gaps above the last row alone', () => {
    const board = [cell('a', 0, 0, 4, 3), cell('b', 0, 10, 12, 2)];
    expect(firstFreeSpot(board, size)).toEqual({ x: 0, y: 12 });
  });

  it('places a copy next to its original when there is room on its right', () => {
    const board = [cell('a', 0, 0, 4, 3), cell('b', 0, 3, 4, 3)];
    expect(firstFreeSpot(board, size, 'b')).toEqual({ x: 4, y: 3 });
  });

  it('places a copy below its original when its right is taken or past the edge', () => {
    const board = [cell('a', 0, 0, 4, 3), cell('b', 4, 0, 8, 3), cell('c', 0, 9, 12, 1)];
    expect(firstFreeSpot(board, size, 'a')).toEqual({ x: 0, y: 3 });
    expect(firstFreeSpot(board, size, 'b')).toEqual({ x: 4, y: 3 });
  });

  it('takes the first free spot under the original when right below it is taken', () => {
    const board = [cell('a', 0, 0, 4, 3), cell('b', 4, 0, 8, 3), cell('c', 0, 3, 12, 4)];
    expect(firstFreeSpot(board, size, 'a')).toEqual({ x: 0, y: 7 });
  });

  it('falls back to the bottom for an unknown original', () => {
    expect(firstFreeSpot([cell('a', 0, 0, 12, 3)], size, 'zz')).toEqual({ x: 0, y: 3 });
  });
});

describe('moveCard', () => {
  const board = [cell('a', 4, 2, 4, 3), cell('b', 0, 6, 4, 3)];

  it('moves a card one cell in each direction', () => {
    expect(moveCard(board, 'a', 'left')[0]).toEqual(cell('a', 3, 2, 4, 3));
    expect(moveCard(board, 'a', 'right')[0]).toEqual(cell('a', 5, 2, 4, 3));
    expect(moveCard(board, 'a', 'up')[0]).toEqual(cell('a', 4, 1, 4, 3));
    expect(moveCard(board, 'a', 'down')[0]).toEqual(cell('a', 4, 3, 4, 3));
  });

  it("stops at the board's left, right and top edges", () => {
    const edges = [cell('left', 0, 0, 4, 3), cell('right', 8, 0, 4, 3)];
    expect(moveCard(edges, 'left', 'left')).toEqual(edges);
    expect(moveCard(edges, 'left', 'up')).toEqual(edges);
    expect(moveCard(edges, 'right', 'right')).toEqual(edges);
  });

  it('pushes the card it moves onto down', () => {
    const stacked = [cell('a', 0, 0, 4, 3), cell('b', 0, 3, 4, 3)];
    expect(moveCard(stacked, 'a', 'down')).toEqual([cell('a', 0, 1, 4, 3), cell('b', 0, 4, 4, 3)]);
  });

  it('leaves the board alone for an unknown card', () => {
    expect(moveCard(board, 'zz', 'down')).toEqual(board);
  });
});

describe('growToMinimum', () => {
  it('grows a card to the minimum and pushes the cards below it down', () => {
    const board = [cell('a', 0, 0, 4, 3), cell('b', 0, 3, 4, 3), cell('c', 8, 0, 4, 9)];
    expect(growToMinimum(board, 'a', { w: 6, h: 5 })).toEqual([
      cell('a', 0, 0, 6, 5),
      cell('b', 0, 5, 4, 3),
      cell('c', 8, 0, 4, 9),
    ]);
  });

  it('keeps a card already at or above the minimum, and each side it already has', () => {
    const board = [cell('a', 0, 0, 8, 3)];
    expect(growToMinimum(board, 'a', { w: 4, h: 3 })).toEqual(board);
    expect(growToMinimum(board, 'a', { w: 4, h: 6 })).toEqual([cell('a', 0, 0, 8, 6)]);
  });

  it('shifts a card left when growing would take it past the right edge', () => {
    expect(growToMinimum([cell('a', 10, 0, 2, 2)], 'a', { w: 4, h: 2 })).toEqual([
      cell('a', 8, 0, 4, 2),
    ]);
  });
});

describe('threeAcross', () => {
  it('places an ordered list three across, each row below the tallest card above it', () => {
    expect(
      threeAcross([
        { id: 'a', h: 3 },
        { id: 'b', h: 8 },
        { id: 'c', h: 6 },
        { id: 'd', h: 6 },
        { id: 'e', h: 3 },
      ]),
    ).toEqual([
      cell('a', 0, 0, 4, 3),
      cell('b', 4, 0, 4, 8),
      cell('c', 8, 0, 4, 6),
      cell('d', 0, 8, 4, 6),
      cell('e', 4, 8, 4, 3),
    ]);
  });

  it('places nothing for an empty list', () => {
    expect(threeAcross([])).toEqual([]);
  });
});

describe('resizeCard', () => {
  const min = { w: 3, h: 2 };

  it('grows and shrinks a card one cell from its bottom-right corner', () => {
    const board = [cell('a', 0, 0, 4, 3)];
    expect(resizeCard(board, 'a', 'right', min)).toEqual([cell('a', 0, 0, 5, 3)]);
    expect(resizeCard(board, 'a', 'left', min)).toEqual([cell('a', 0, 0, 3, 3)]);
    expect(resizeCard(board, 'a', 'down', min)).toEqual([cell('a', 0, 0, 4, 4)]);
    expect(resizeCard(board, 'a', 'up', min)).toEqual([cell('a', 0, 0, 4, 2)]);
  });

  it('stops at its minimum, the right edge and the maximum height', () => {
    const smallest = [cell('a', 0, 0, 3, 2)];
    expect(resizeCard(smallest, 'a', 'left', min)).toEqual(smallest);
    expect(resizeCard(smallest, 'a', 'up', min)).toEqual(smallest);
    const widest = [cell('a', 8, 0, 4, 40)];
    expect(resizeCard(widest, 'a', 'right', min)).toEqual(widest);
    expect(resizeCard(widest, 'a', 'down', min)).toEqual(widest);
  });

  it('pushes the cards below a growing card down', () => {
    const board = [cell('a', 0, 0, 4, 3), cell('b', 0, 3, 8, 3)];
    expect(resizeCard(board, 'a', 'down', min)).toEqual([
      cell('a', 0, 0, 4, 4),
      cell('b', 0, 4, 8, 3),
    ]);
  });
});
