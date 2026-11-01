import { describe, expect, test } from 'vitest';
import { describeActions, type RuleNames } from './describe';

const names: RuleNames = {
  accounts: new Map(),
  payees: new Map([['p1', 'Migros']]),
  categories: new Map([['c1', 'Food › Groceries']]),
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
