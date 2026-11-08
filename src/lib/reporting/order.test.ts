import { describe, expect, it } from 'vitest';
import { isSameOrder, moveBy } from './order';

describe('moveBy', () => {
  it('moves an id one place up or down', () => {
    expect(moveBy(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveBy(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the order alone at either end or for an unknown id', () => {
    expect(moveBy(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(moveBy(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
    expect(moveBy(['a', 'b'], 'z', 1)).toEqual(['a', 'b']);
  });

  it('returns a new list', () => {
    const ids = ['a', 'b'];
    expect(moveBy(ids, 'a', 1)).not.toBe(ids);
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('isSameOrder', () => {
  it('compares ids place by place', () => {
    expect(isSameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(isSameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(isSameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});
