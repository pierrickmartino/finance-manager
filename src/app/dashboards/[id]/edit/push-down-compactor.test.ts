import type { Layout } from 'react-grid-layout';
import { describe, expect, it } from 'vitest';
import { GRID_COLUMNS } from '@/lib/reporting/board';
import { createPushDownCompactor, layoutCells } from './push-down-compactor';

const item = (i: string, x: number, y: number, w: number, h: number) => ({ i, x, y, w, h });

/** Where each card is, as `id x,y w×h`, so a failure reads as a board. */
const places = (layout: Layout) =>
  layoutCells(layout).map(({ id, x, y, w, h }) => `${id} ${x},${y} ${w}x${h}`);

describe('createPushDownCompactor', () => {
  it('moves nothing outside a drag or resize', () => {
    const { compactor } = createPushDownCompactor();
    const overlapping = [item('a', 0, 0, 4, 3), item('b', 0, 1, 4, 3)];

    const compacted = compactor.compact(overlapping, GRID_COLUMNS);

    expect(places(compacted)).toEqual(['a 0,0 4x3', 'b 0,1 4x3']);
    expect(compacted).not.toBe(overlapping);
  });

  it('pushes the cards in the dragged card’s way down, packing nothing up', () => {
    const pushing = createPushDownCompactor();
    const start = [item('a', 0, 0, 4, 3), item('b', 4, 0, 4, 3), item('c', 8, 6, 4, 3)];
    pushing.begin('a', start);

    const compacted = pushing.compactor.compact(
      [item('a', 4, 1, 4, 3), item('b', 4, 0, 4, 3), item('c', 8, 6, 4, 3)],
      GRID_COLUMNS,
    );

    expect(places(compacted)).toEqual(['a 4,1 4x3', 'b 4,4 4x3', 'c 8,6 4x3']);
  });

  it('starts each step from the board as the gesture began, so a card passed over goes back', () => {
    const pushing = createPushDownCompactor();
    const start = [item('a', 0, 0, 4, 3), item('b', 4, 0, 4, 3)];
    pushing.begin('a', start);

    pushing.compactor.compact([item('a', 4, 0, 4, 3), item('b', 4, 0, 4, 3)], GRID_COLUMNS);
    // react-grid-layout hands back the board it last drew, with b pushed down.
    const passed = pushing.compactor.compact(
      [item('a', 8, 0, 4, 3), item('b', 4, 3, 4, 3)],
      GRID_COLUMNS,
    );

    expect(places(passed)).toEqual(['a 8,0 4x3', 'b 4,0 4x3']);
  });

  it('pushes the cards under a card being resized down', () => {
    const pushing = createPushDownCompactor();
    pushing.begin('a', [item('a', 0, 0, 4, 3), item('b', 0, 3, 8, 3)]);

    const compacted = pushing.compactor.compact(
      [item('a', 0, 0, 4, 5), item('b', 0, 3, 8, 3)],
      GRID_COLUMNS,
    );

    expect(places(compacted)).toEqual(['a 0,0 4x5', 'b 0,5 8x3']);
  });

  it('moves nothing once the gesture has ended', () => {
    const pushing = createPushDownCompactor();
    pushing.begin('a', [item('a', 0, 0, 4, 3), item('b', 0, 3, 4, 3)]);
    pushing.end();

    const compacted = pushing.compactor.compact(
      [item('a', 0, 2, 4, 3), item('b', 0, 3, 4, 3)],
      GRID_COLUMNS,
    );

    expect(places(compacted)).toEqual(['a 0,2 4x3', 'b 0,3 4x3']);
  });
});
