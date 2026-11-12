import { describe, expect, it } from 'vitest';
import type { Cell } from './board';
import { keyboardStep } from './board-keys';

const cell = (id: string, x: number, y: number, w: number, h: number): Cell => ({ id, x, y, w, h });
const min = { w: 3, h: 4 };

describe('keyboardStep', () => {
  it('moves the card one cell per arrow key and says where it is now, counting from 1', () => {
    const board = [cell('a', 4, 2, 4, 6)];

    expect(keyboardStep(board, 'a', { key: 'ArrowRight', shiftKey: false }, min)).toEqual({
      cells: [cell('a', 5, 2, 4, 6)],
      announcement: 'Moved to column 6, row 3',
    });
    expect(keyboardStep(board, 'a', { key: 'ArrowUp', shiftKey: false }, min)?.announcement).toBe(
      'Moved to column 5, row 2',
    );
  });

  it('resizes the card one cell per Shift+arrow and says its size, columns by rows', () => {
    const board = [cell('a', 4, 2, 4, 6)];

    expect(keyboardStep(board, 'a', { key: 'ArrowRight', shiftKey: true }, min)).toEqual({
      cells: [cell('a', 4, 2, 5, 6)],
      announcement: 'Resized to 5 by 6',
    });
    expect(keyboardStep(board, 'a', { key: 'ArrowUp', shiftKey: true }, min)?.announcement).toBe(
      'Resized to 4 by 5',
    );
  });

  it('leaves the board as it is at an edge, and says why', () => {
    const corner = [cell('a', 0, 0, 4, 6), cell('b', 8, 0, 4, 6)];
    const step = (id: string, key: string) =>
      keyboardStep(corner, id, { key, shiftKey: false }, min);

    expect(step('a', 'ArrowLeft')).toEqual({
      cells: corner,
      announcement: 'Already at the left edge',
    });
    expect(step('a', 'ArrowUp')?.announcement).toBe('Already at the top');
    expect(step('b', 'ArrowRight')?.announcement).toBe('Already at the right edge');
  });

  it('leaves the board as it is at the minimum size, the right edge or the tallest, and says why', () => {
    const smallest = [cell('a', 0, 0, 3, 4)];
    const widest = [cell('a', 0, 0, 12, 40)];
    const step = (board: Cell[], key: string) =>
      keyboardStep(board, 'a', { key, shiftKey: true }, min);

    expect(step(smallest, 'ArrowLeft')).toEqual({
      cells: smallest,
      announcement: 'Already as narrow as it can be',
    });
    expect(step(smallest, 'ArrowUp')?.announcement).toBe('Already as short as it can be');
    expect(step(widest, 'ArrowRight')?.announcement).toBe('Already at the right edge');
    expect(step(widest, 'ArrowDown')?.announcement).toBe('Already as tall as it can be');
  });

  it('ignores keys other than the arrows', () => {
    expect(
      keyboardStep([cell('a', 0, 0, 4, 6)], 'a', { key: 'Enter', shiftKey: false }, min),
    ).toBeNull();
  });
});
