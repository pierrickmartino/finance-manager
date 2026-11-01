import { describe, expect, test } from 'vitest';
import { shifted, shiftedAmongKind } from './order';

describe('shifted', () => {
  test('moves an id one place up', () => {
    expect(shifted(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
  });

  test('moves an id one place down', () => {
    expect(shifted(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  test('leaves the order alone past either end', () => {
    expect(shifted(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(shifted(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
  });

  test('leaves the order alone for an unknown id', () => {
    expect(shifted(['a', 'b'], 'x', 1)).toEqual(['a', 'b']);
  });
});

describe('shiftedAmongKind', () => {
  // Groups are shown sectioned by type, so moving one swaps it with its neighbour in the section.
  const groups = [
    { id: 'salary', kind: 'income' },
    { id: 'rent', kind: 'expense' },
    { id: 'bonus', kind: 'income' },
    { id: 'food', kind: 'expense' },
  ];

  test('swaps with the nearest item of the same kind above', () => {
    expect(shiftedAmongKind(groups, 'bonus', -1)).toEqual(['bonus', 'rent', 'salary', 'food']);
  });

  test('swaps with the nearest item of the same kind below', () => {
    expect(shiftedAmongKind(groups, 'rent', 1)).toEqual(['salary', 'food', 'bonus', 'rent']);
  });

  test('leaves the order alone when no item of the same kind is in that direction', () => {
    expect(shiftedAmongKind(groups, 'salary', -1)).toEqual(['salary', 'rent', 'bonus', 'food']);
    expect(shiftedAmongKind(groups, 'food', 1)).toEqual(['salary', 'rent', 'bonus', 'food']);
  });
});
