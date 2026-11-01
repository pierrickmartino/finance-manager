import { describe, expect, it } from 'vitest';
import { initialSplitDrafts, remainingMinor } from './split-lines';

const category = { id: 'c1', name: 'Groceries', groupId: 'g', groupName: 'Food' };

function detail(amountMinor: number | null, counterpartyName: string | null) {
  return { amountMinor, counterpartyName, counterpartyIban: null, paymentReference: null };
}

function startingLines(amountMinor: number, bundledDetails: ReturnType<typeof detail>[] | null) {
  return initialSplitDrafts(
    { amountMinor, currency: 'CHF', splitLines: [], bundledDetails },
    'apostrophe',
  );
}

describe('the split form', () => {
  it('starts with one line per bundled payment, in the bank order, when their amounts add up', () => {
    expect(
      startingLines(-118735, [
        detail(-14285, 'Services Industriels Exemple'),
        detail(-38950, 'Assurance Ménage Exemple SA'),
        detail(-65500, null),
      ]),
    ).toEqual([
      { amount: '-142.85', categoryId: '', tags: '', note: 'Services Industriels Exemple' },
      { amount: '-389.50', categoryId: '', tags: '', note: 'Assurance Ménage Exemple SA' },
      { amount: '-655.00', categoryId: '', tags: '', note: '' },
    ]);
  });

  it('starts with one line for the full amount when a bundled payment has no amount', () => {
    expect(startingLines(-10000, [detail(-4000, 'A'), detail(null, 'B')])).toEqual([
      { amount: '-100.00', categoryId: '', tags: '', note: '' },
    ]);
  });

  it("starts with one line for the full amount when the bundled payments don't add up", () => {
    expect(startingLines(-10000, [detail(-4000, 'A'), detail(-5000, 'B')])).toEqual([
      { amount: '-100.00', categoryId: '', tags: '', note: '' },
    ]);
  });

  it('starts with one line for the full amount when there are no bundled payments', () => {
    expect(startingLines(-10000, [])).toEqual([
      { amount: '-100.00', categoryId: '', tags: '', note: '' },
    ]);
  });

  it('starts with one line for the full amount when the Transaction is not split', () => {
    expect(
      initialSplitDrafts(
        { amountMinor: -118735, currency: 'CHF', splitLines: [], bundledDetails: null },
        'apostrophe',
      ),
    ).toEqual([{ amount: "-1'187.35", categoryId: '', tags: '', note: '' }]);
  });

  it('starts with the saved Split lines when the Transaction is split', () => {
    const drafts = initialSplitDrafts(
      {
        amountMinor: -10000,
        currency: 'CHF',
        bundledDetails: [detail(-4000, 'Ignored'), detail(-6000, 'Also ignored')],
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
