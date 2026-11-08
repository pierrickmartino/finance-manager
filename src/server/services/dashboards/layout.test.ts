import { describe, expect, it } from 'vitest';
import { insertAt, storyLayout } from './layout';

describe('insertAt', () => {
  it('inserts at the position, or last without one', () => {
    expect(insertAt(['a', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
    expect(insertAt(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('clamps a position outside the list', () => {
    expect(insertAt(['a'], 'z', 9)).toEqual(['a', 'z']);
    expect(insertAt(['a'], 'z', -3)).toEqual(['z', 'a']);
  });

  it('leaves the original list as it is', () => {
    const items = ['a'];
    insertAt(items, 'b', 0);
    expect(items).toEqual(['a']);
  });
});

describe('storyLayout', () => {
  it('places the nth Widget at y n, x 0, keeping its size', () => {
    expect(storyLayout(2, { w: 4, h: 5 })).toEqual({ x: 0, y: 2, w: 4, h: 5 });
    expect(storyLayout(0)).toEqual({ x: 0, y: 0, w: 6, h: 8 });
  });
});
