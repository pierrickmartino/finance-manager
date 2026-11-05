import { describe, expect, it } from 'vitest';
import type { PayeeRef } from '@/server/services/payees';
import { initialSplitDrafts, remainingMinor, splitAllocation } from './split-lines';

const category = { id: 'c1', name: 'Groceries', groupId: 'g', groupName: 'Food' };
const coop = { id: 'p1', name: 'Coop' };
const migros = { id: 'p2', name: 'Migros' };

function detail(amountMinor: number | null, counterpartyName: string | null) {
  return { amountMinor, counterpartyName, counterpartyIban: null, paymentReference: null };
}

function startingLines(
  amountMinor: number,
  bundledDetails: ReturnType<typeof detail>[] | null,
  payees: readonly PayeeRef[] = [],
) {
  return initialSplitDrafts(
    { amountMinor, currency: 'CHF', splitLines: [], bundledDetails },
    'apostrophe',
    payees,
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

  it("suggests each bundled payment's Payee by name, ignoring case, accents and spacing", () => {
    const payees = [
      { id: 'p-sie', name: 'services industriels  exemple' },
      { id: 'p-ame', name: 'Assurance Menage Exemple SA' },
    ];

    expect(
      startingLines(
        -118735,
        [
          detail(-14285, 'Services Industriels Exemple'),
          detail(-38950, 'Assurance Ménage Exemple SA'),
          detail(-65500, 'Garderie Les Exemples'),
        ],
        payees,
      ),
    ).toEqual([
      {
        amount: '-142.85',
        categoryId: '',
        payeeId: 'p-sie',
        tags: '',
        note: 'Services Industriels Exemple',
      },
      {
        amount: '-389.50',
        categoryId: '',
        payeeId: 'p-ame',
        tags: '',
        note: 'Assurance Ménage Exemple SA',
      },
      { amount: '-655.00', categoryId: '', tags: '', note: 'Garderie Les Exemples' },
    ]);
  });

  it('leaves a bundled payment without a counterparty name, or with an ambiguous one, on the Transaction Payee', () => {
    const payees = [
      { id: 'p-cafe', name: 'Cafe' },
      { id: 'p-cafe2', name: 'Café' },
      { id: 'p-empty', name: ' ' },
    ];

    expect(startingLines(-10000, [detail(-4000, 'CAFÉ'), detail(-6000, null)], payees)).toEqual([
      { amount: '-40.00', categoryId: '', tags: '', note: 'CAFÉ' },
      { amount: '-60.00', categoryId: '', tags: '', note: '' },
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
        [],
      ),
    ).toEqual([{ amount: "-1'187.35", categoryId: '', tags: '', note: '' }]);
  });

  it('starts with the saved Split lines, by id, with their own Payees, when the Transaction is split', () => {
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
            transferId: null,
            payee: coop,
            reportedPayee: coop,
          },
          {
            id: 'l2',
            amountMinor: -3000,
            category: { ...category, id: 'c2', groupType: 'expense' },
            tags: [],
            note: null,
            transferId: null,
            payee: null,
            reportedPayee: migros,
          },
        ],
      },
      'dot',
      [coop, migros],
    );

    expect(drafts).toEqual([
      {
        id: 'l1',
        amount: '-70,00',
        categoryId: 'c1',
        payeeId: 'p1',
        tags: 'Family',
        note: 'weekly',
      },
      { id: 'l2', amount: '-30,00', categoryId: 'c2', tags: '', note: '' },
    ]);
  });

  it('starts a Transfer line as a Transfer, with no Category', () => {
    const drafts = initialSplitDrafts(
      {
        amountMinor: -150000,
        currency: 'CHF',
        bundledDetails: null,
        splitLines: [
          {
            id: 'l1',
            amountMinor: -100000,
            category: null,
            tags: [],
            note: 'To savings',
            transferId: 'tr1',
            payee: null,
            reportedPayee: migros,
          },
          {
            id: 'l2',
            amountMinor: -50000,
            category: { ...category, groupType: 'expense' },
            tags: [],
            note: null,
            transferId: null,
            payee: null,
            reportedPayee: migros,
          },
        ],
      },
      'apostrophe',
      [migros],
    );

    expect(drafts).toEqual([
      {
        id: 'l1',
        amount: "-1'000.00",
        categoryId: '',
        tags: '',
        note: 'To savings',
        isTransfer: true,
      },
      { id: 'l2', amount: '-500.00', categoryId: 'c1', tags: '', note: '' },
    ]);
  });

  it('shows the remaining amount live, ignoring blank lines, and none while an amount is invalid', () => {
    expect(remainingMinor(-10000, ['-70.00', ''], 'apostrophe', 'CHF')).toBe(-3000);
    expect(remainingMinor(-10000, ['-70.00', '-30'], 'apostrophe', 'CHF')).toBe(0);
    expect(remainingMinor(-10000, ['-70.00', '+5'], 'apostrophe', 'CHF')).toBe(-3500);
    expect(remainingMinor(-10000, ['abc'], 'apostrophe', 'CHF')).toBeNull();
  });
});

describe('the Split allocation', () => {
  const allocation = (totalMinor: number, amounts: string[]) =>
    splitAllocation(totalMinor, amounts, 'apostrophe', 'CHF');

  it('is balanced when the lines add up to the amount, with each line part in order', () => {
    expect(allocation(-118735, ['-142.85', '-389.50', '-655.00'])).toEqual({
      parts: [-14285, -38950, -65500],
      remaining: 0,
      status: 'balanced',
    });
  });

  it('is under while some of the amount is left, counting a blank line as zero', () => {
    expect(allocation(-10000, ['-30', ''])).toEqual({
      parts: [-3000, 0],
      remaining: -7000,
      status: 'under',
    });
  });

  it('is over when the lines take more than the amount', () => {
    expect(allocation(-10000, ['-80', '-50'])).toMatchObject({ remaining: 3000, status: 'over' });
  });

  it('is over when a line goes the other way and the rest is beyond the amount', () => {
    expect(allocation(10000, ['120', '-10'])).toMatchObject({ remaining: -1000, status: 'over' });
  });

  it('is invalid while a typed amount is not an amount, its part counting as zero', () => {
    expect(allocation(-10000, ['-30', 'abc'])).toEqual({
      parts: [-3000, 0],
      remaining: null,
      status: 'invalid',
    });
  });
});
