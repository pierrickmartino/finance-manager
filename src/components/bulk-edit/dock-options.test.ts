import { describe, expect, test } from 'vitest';
import type { CategoryGroup } from '@/server/services/categories';
import {
  bulkResultMessage,
  filterCategoryGroups,
  matchesQuery,
  nameChoices,
  tagOptions,
} from './dock-options';

const group = (id: string, name: string, categories: string[]): CategoryGroup =>
  ({
    id,
    name,
    type: 'expense',
    categories: categories.map((category) => ({ id: `${id}-${category}`, name: category })),
  }) as unknown as CategoryGroup;

describe('matchesQuery', () => {
  test('matches a part of the name, ignoring case and surrounding spaces', () => {
    expect(matchesQuery('Groceries', ' groc ')).toBe(true);
    expect(matchesQuery('Groceries', 'fuel')).toBe(false);
  });

  test('matches everything when nothing is typed', () => {
    expect(matchesQuery('Groceries', '')).toBe(true);
  });
});

describe('filterCategoryGroups', () => {
  const groups = [
    group('food', 'Food', ['Groceries', 'Restaurants']),
    group('car', 'Transport', ['Fuel']),
  ];

  test('keeps only the matching Categories, and drops groups left empty', () => {
    const filtered = filterCategoryGroups(groups, 'rest');
    expect(filtered.map((g) => g.name)).toEqual(['Food']);
    expect(filtered[0]!.categories.map((c) => c.name)).toEqual(['Restaurants']);
  });

  test('does not change the groups it is given', () => {
    filterCategoryGroups(groups, 'rest');
    expect(groups[0]!.categories).toHaveLength(2);
  });
});

describe('nameChoices', () => {
  const names = ['Migros', 'Coop'];

  test('offers the matches and the typed text as a new name', () => {
    expect(nameChoices(names, 'mi')).toEqual({ matches: ['Migros'], newName: 'mi' });
  });

  test('offers no new name when the typed text is an existing one, in any case', () => {
    expect(nameChoices(names, ' migros ')).toEqual({ matches: ['Migros'], newName: null });
  });

  test('offers every name and no new one when nothing is typed', () => {
    expect(nameChoices(names, '  ')).toEqual({ matches: names, newName: null });
  });
});

describe('tagOptions', () => {
  const trip = { id: 't', name: 'Trip' };
  const work = { id: 'w', name: 'Work' };
  const gift = { id: 'g', name: 'Gift' };

  test('says whether all, some or none of the selection carry each Tag', () => {
    const options = tagOptions([trip, work, gift], [[trip, work], [trip], [trip]]);
    expect(options).toEqual([
      { ...trip, state: 'all', carriers: 3 },
      { ...work, state: 'some', carriers: 1 },
      { ...gift, state: 'none', carriers: 0 },
    ]);
  });

  test('marks every Tag unknown when the selection reaches beyond the page', () => {
    expect(tagOptions([trip], null)).toEqual([{ ...trip, state: 'unknown', carriers: 0 }]);
  });
});

describe('bulkResultMessage', () => {
  test('reports the changed Transactions', () => {
    expect(bulkResultMessage('Set Groceries', { batchId: 'b', count: 1, leftOut: 0 })).toBe(
      'Set Groceries: 1 Transaction changed.',
    );
  });

  test('adds the split or Transfer Transactions left out', () => {
    expect(bulkResultMessage('Set Groceries', { batchId: 'b', count: 3, leftOut: 1 })).toBe(
      'Set Groceries: 3 Transactions changed · 1 split or Transfer left out.',
    );
  });
});
