import { describe, expect, test } from 'vitest';
import { describeActions, describeGrouping, type RuleNames } from './describe';

const names: RuleNames = {
  accounts: new Map(),
  payees: new Map([['p1', 'Migros']]),
  categories: new Map([['c1', 'Food › Groceries']]),
  categoryParts: new Map([['c1', { group: 'Food', name: 'Groceries' }]]),
  tags: new Map([
    ['t1', 'card'],
    ['t2', 'food'],
  ]),
};

describe('describeActions', () => {
  test('lists the Payee, the Category, then each Tag', () => {
    expect(
      describeActions({ payeeId: 'p1', categoryId: 'c1', tagIds: ['t1', 't2'] }, names),
    ).toEqual([
      { kind: 'payee', label: 'Payee: Migros' },
      { kind: 'category', label: 'Category: Food › Groceries' },
      { kind: 'tag', label: 'Tag: card' },
      { kind: 'tag', label: 'Tag: food' },
    ]);
  });

  test('is empty when the Rule sets nothing', () => {
    expect(describeActions({ payeeId: null, categoryId: null, tagIds: [] }, names)).toEqual([]);
  });

  test('names a deleted Payee, Category or Tag as deleted', () => {
    expect(describeActions({ payeeId: 'gone', categoryId: null, tagIds: ['gone'] }, names)).toEqual(
      [
        { kind: 'payee', label: 'Payee: (deleted)' },
        { kind: 'tag', label: 'Tag: (deleted)' },
      ],
    );
  });
});

describe('describeGrouping', () => {
  test('names the Payee and the Category with its Category Group', () => {
    expect(describeGrouping({ payeeId: 'p1', categoryId: 'c1', tagIds: [] }, names)).toEqual({
      payee: { id: 'p1', name: 'Migros', parent: null },
      category: { id: 'c1', name: 'Groceries', parent: 'Food' },
    });
  });

  test('is unset for what the Rule does not set', () => {
    expect(describeGrouping({ payeeId: null, categoryId: null, tagIds: ['t1'] }, names)).toEqual({
      payee: null,
      category: null,
    });
  });

  test('names a deleted Payee or Category as deleted', () => {
    expect(describeGrouping({ payeeId: 'gone', categoryId: 'gone', tagIds: [] }, names)).toEqual({
      payee: { id: 'gone', name: '(deleted)', parent: null },
      category: { id: 'gone', name: '(deleted)', parent: null },
    });
  });
});
