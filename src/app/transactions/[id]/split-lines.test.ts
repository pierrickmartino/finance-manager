import { describe, expect, it } from 'vitest';
import { initialSplitDrafts, remainingMinor } from './split-lines';

const category = { id: 'c1', name: 'Groceries', groupId: 'g', groupName: 'Food' };

describe('the split form', () => {
  it('starts with one line for the full amount when the Transaction is not split', () => {
    expect(
      initialSplitDrafts({ amountMinor: -118735, currency: 'CHF', splitLines: [] }, 'apostrophe'),
    ).toEqual([{ amount: "-1'187.35", categoryId: '', tags: '', note: '' }]);
  });

  it('starts with the saved Split lines when the Transaction is split', () => {
    const drafts = initialSplitDrafts(
      {
        amountMinor: -10000,
        currency: 'CHF',
        splitLines: [
          {
            id: 'l1',
            amountMinor: -7000,
            category: { ...category, groupType: 'expense' },
            tags: [{ id: 't', name: 'Family' }],
            note: 'weekly',
          },
          {
            id: 'l2',
            amountMinor: -3000,
            category: { ...category, id: 'c2', groupType: 'expense' },
            tags: [],
            note: null,
          },
        ],
      },
      'dot',
    );

    expect(drafts).toEqual([
      { amount: '-70,00', categoryId: 'c1', tags: 'Family', note: 'weekly' },
      { amount: '-30,00', categoryId: 'c2', tags: '', note: '' },
    ]);
  });

  it('shows the remaining amount live, ignoring blank lines, and none while an amount is invalid', () => {
    expect(remainingMinor(-10000, ['-70.00', ''], 'apostrophe', 'CHF')).toBe(-3000);
    expect(remainingMinor(-10000, ['-70.00', '-30'], 'apostrophe', 'CHF')).toBe(0);
    expect(remainingMinor(-10000, ['-70.00', '+5'], 'apostrophe', 'CHF')).toBe(-3500);
    expect(remainingMinor(-10000, ['abc'], 'apostrophe', 'CHF')).toBeNull();
  });
});
