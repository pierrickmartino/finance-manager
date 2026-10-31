import { describe, expect, it } from 'vitest';
import { moveWidgetByKey, type GridItem } from './grid-move';

/** The starter Dashboard: two rows of two half-width Widgets. */
const STARTER: GridItem[] = [
  { id: 'a', x: 0, y: 0, w: 6, h: 8 },
  { id: 'b', x: 6, y: 0, w: 6, h: 8 },
  { id: 'c', x: 0, y: 8, w: 6, h: 9 },
  { id: 'd', x: 6, y: 8, w: 6, h: 9 },
];

function positions(layout: readonly GridItem[]): Record<string, string> {
  return Object.fromEntries(layout.map(({ id, x, y }) => [id, `${x},${y}`]));
}

describe('moving a Widget with the arrow keys', () => {
  it('ArrowDown swaps it with the Widget below', () => {
    expect(positions(moveWidgetByKey(STARTER, 'a', 'ArrowDown'))).toEqual({
      a: '0,9',
      b: '6,0',
      c: '0,0',
      d: '6,8',
    });
  });

  it('ArrowUp swaps it with the Widget above', () => {
    expect(positions(moveWidgetByKey(STARTER, 'c', 'ArrowUp'))).toEqual({
      a: '0,9',
      b: '6,0',
      c: '0,0',
      d: '6,8',
    });
  });

  it('ArrowRight moves it one column, pushing what it runs into down', () => {
    const moved = positions(moveWidgetByKey(STARTER, 'a', 'ArrowRight'));

    expect(moved.a).toBe('1,0');
    expect(moved.b).not.toBe('6,0');
  });

  it('ArrowLeft moves it one column back', () => {
    const shifted = moveWidgetByKey(STARTER, 'a', 'ArrowRight');

    expect(positions(moveWidgetByKey(shifted, 'a', 'ArrowLeft')).a).toBe('0,0');
  });

  it('stays put at the edges', () => {
    expect(moveWidgetByKey(STARTER, 'a', 'ArrowUp')).toEqual(STARTER);
    expect(moveWidgetByKey(STARTER, 'a', 'ArrowLeft')).toEqual(STARTER);
    expect(moveWidgetByKey(STARTER, 'b', 'ArrowRight')).toEqual(STARTER);
    expect(moveWidgetByKey(STARTER, 'c', 'ArrowDown')).toEqual(STARTER);
  });

  it('does not change the layout it is given', () => {
    const copy = STARTER.map((item) => ({ ...item }));

    moveWidgetByKey(STARTER, 'a', 'ArrowDown');

    expect(STARTER).toEqual(copy);
  });
});
