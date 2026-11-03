import { describe, expect, it } from 'vitest';
import { activeFilterCount, queryFilterLists, type FilterChoices } from './query-filters';

const CHOICES: FilterChoices = {
  accounts: [
    { id: 'a1', bankName: 'UBS', name: 'Household', currency: 'CHF' },
    { id: 'a2', bankName: 'Revolut', name: 'Travel', currency: 'EUR' },
    { id: 'a3', bankName: 'UBS', name: 'Savings', currency: 'CHF' },
  ],
  groups: [
    {
      id: 'g1',
      name: 'Housing',
      categories: [
        { id: 'c1', name: 'Rent' },
        { id: 'c2', name: 'Utilities' },
      ],
    },
    { id: 'g2', name: 'Food', categories: [{ id: 'c3', name: 'Groceries' }] },
  ],
  payees: [{ id: 'p1', name: 'Migros' }],
  tags: [{ id: 't1', name: 'Holiday' }],
};

describe('queryFilterLists', () => {
  it('lists the seven filters, in the order the editor shows them, with their URL names', () => {
    // Act
    const lists = queryFilterLists({}, CHOICES);

    // Assert
    expect(lists.map((list) => [list.name, list.label])).toEqual([
      ['account', 'Accounts'],
      ['group', 'Category groups'],
      ['category', 'Categories'],
      ['payee', 'Payees'],
      ['tag', 'Tags'],
      ['type', 'Category group types'],
      ['currency', 'Currencies'],
    ]);
  });

  it('labels Accounts with their Bank and groups Categories under their Category group', () => {
    const [accounts, , categories] = queryFilterLists({}, CHOICES);

    expect(accounts?.options[0]).toEqual({ value: 'a1', label: 'UBS · Household' });
    expect(categories?.options).toEqual([
      { value: 'c1', label: 'Rent', group: 'Housing' },
      { value: 'c2', label: 'Utilities', group: 'Housing' },
      { value: 'c3', label: 'Groceries', group: 'Food' },
    ]);
  });

  it('offers each Account Currency once, sorted', () => {
    const currencies = queryFilterLists({}, CHOICES).find((list) => list.name === 'currency');

    expect(currencies?.options.map((option) => option.value)).toEqual(['CHF', 'EUR']);
  });

  it('marks the values the query already filters on as selected', () => {
    const lists = queryFilterLists(
      { accountIds: ['a2'], categoryGroupTypes: ['expense'] },
      CHOICES,
    );

    expect(lists.find((list) => list.name === 'account')?.selected).toEqual(['a2']);
    expect(lists.find((list) => list.name === 'type')?.selected).toEqual(['expense']);
    expect(lists.find((list) => list.name === 'tag')?.selected).toEqual([]);
  });
});

describe('activeFilterCount', () => {
  it('counts the filters with at least one value selected', () => {
    const lists = queryFilterLists({ accountIds: ['a1', 'a3'], tagIds: ['t1'] }, CHOICES);

    expect(activeFilterCount(lists)).toBe(2);
  });

  it('is zero when nothing is filtered (everything is included)', () => {
    expect(activeFilterCount(queryFilterLists({}, CHOICES))).toBe(0);
  });
});
