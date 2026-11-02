import { describe, expect, it } from 'vitest';
import { transactionBadges } from './transaction-badges';

const groceries = { id: 'c1', name: 'Groceries', groupId: 'g1', groupName: 'Food' };

function badges(
  overrides: {
    transferId?: string | null;
    isManual?: boolean;
    category?: typeof groceries | null;
    splitLines?: unknown[];
    lockedFields?: ('payee' | 'category' | 'tags' | 'notes')[];
  } = {},
) {
  return transactionBadges(
    { transferId: overrides.transferId ?? null, isManual: overrides.isManual ?? false },
    {
      category: overrides.category ?? null,
      splitLines: overrides.splitLines ?? [],
      lockedFields: overrides.lockedFields ?? [],
    },
  );
}

describe('the status badges of a Transaction', () => {
  it('flags an imported Transaction with no Category as Unclassified', () => {
    expect(badges()).toEqual([
      { label: 'Unclassified', tone: 'warning' },
      { label: 'Imported', tone: 'neutral' },
    ]);
  });

  it('names the Category of a classified Transaction', () => {
    expect(badges({ category: groceries })[0]).toEqual({ label: 'Groceries', tone: 'positive' });
  });

  it('counts the Split lines of a split Transaction', () => {
    expect(badges({ splitLines: [{}, {}, {}] })[0]).toEqual({
      label: 'Split (3)',
      tone: 'neutral',
    });
  });

  it('shows a Transfer as a Transfer, whatever else it holds', () => {
    expect(badges({ transferId: 't1', category: groceries })[0]).toEqual({
      label: 'Transfer',
      tone: 'info',
    });
  });

  it('says a Manual transaction is Manual', () => {
    expect(badges({ isManual: true })[1]).toEqual({ label: 'Manual', tone: 'neutral' });
  });

  it('counts the fields locked against Rules, and says nothing when none is', () => {
    expect(badges({ lockedFields: ['payee', 'tags'] })).toContainEqual({
      label: '2 locked',
      tone: 'neutral',
    });
    expect(badges().map((badge) => badge.label)).not.toContain('0 locked');
  });
});
