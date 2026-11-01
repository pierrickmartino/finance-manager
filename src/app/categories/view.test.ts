import { describe, expect, test } from 'vitest';
import type { Category, CategoryGroup, CategoryGroupType } from '@/server/services/categories';
import { groupsByType, selectGroup, transactionTotal, usagePercent } from './view';

function category(name: string, transactionCount: number): Category {
  return {
    id: `c-${name}`,
    groupId: 'g',
    groupName: 'G',
    groupType: 'expense',
    name,
    sort: 0,
    transactionCount,
  };
}

function group(id: string, type: CategoryGroupType, categories: Category[] = []): CategoryGroup {
  return { id, name: id, type, sort: 0, categories };
}

describe('selectGroup', () => {
  const groups = [group('a', 'income'), group('b', 'expense')];

  test('returns the group named in the URL', () => {
    expect(selectGroup(groups, 'b')?.id).toBe('b');
  });

  test('falls back to the first group when none is named', () => {
    expect(selectGroup(groups, undefined)?.id).toBe('a');
  });

  test('falls back to the first group when the named one no longer exists', () => {
    expect(selectGroup(groups, 'deleted')?.id).toBe('a');
  });

  test('returns nothing when there are no groups', () => {
    expect(selectGroup([], 'a')).toBeUndefined();
  });
});

describe('groupsByType', () => {
  test('sections groups as Income, Expense, Capital, keeping their order', () => {
    const groups = [
      group('rent', 'expense'),
      group('house', 'capital'),
      group('salary', 'income'),
      group('food', 'expense'),
    ];

    const sections = groupsByType(groups);

    expect(sections.map((section) => section.type)).toEqual(['income', 'expense', 'capital']);
    expect(sections[1]!.groups.map((g) => g.id)).toEqual(['rent', 'food']);
  });

  test('leaves out types without groups', () => {
    expect(groupsByType([group('food', 'expense')]).map((section) => section.type)).toEqual([
      'expense',
    ]);
  });
});

describe('transactionTotal', () => {
  test('adds up the Transactions of every Category in the group', () => {
    expect(transactionTotal(group('g', 'expense', [category('a', 3), category('b', 4)]))).toBe(7);
  });
});

describe('usagePercent', () => {
  test('is the share of the busiest Category', () => {
    expect(usagePercent(5, 20)).toBe(25);
  });

  test('is zero when no Category has Transactions', () => {
    expect(usagePercent(0, 0)).toBe(0);
  });
});
