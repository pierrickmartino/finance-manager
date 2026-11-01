import { describe, expect, test } from 'vitest';
import type { Payee } from '@/server/services/payees';
import { filterPayees, payeeHref, payeesByInitial, selectPayee } from './view';

function payee(name: string, transactionCount = 0): Payee {
  return { id: `p-${name}`, name, transactionCount };
}

describe('filterPayees', () => {
  const payees = [payee('Coop'), payee('COOP Pronto'), payee('Migros')];

  test('keeps the Payees whose name contains the query, ignoring case', () => {
    expect(filterPayees(payees, 'coop').map((p) => p.name)).toEqual(['Coop', 'COOP Pronto']);
  });

  test('keeps every Payee when the query is empty or blank', () => {
    expect(filterPayees(payees, '')).toHaveLength(3);
    expect(filterPayees(payees, '   ')).toHaveLength(3);
  });

  test('ignores accents on both sides', () => {
    expect(filterPayees([payee('Café Rose')], 'cafe').map((p) => p.name)).toEqual(['Café Rose']);
  });
});

describe('selectPayee', () => {
  const payees = [payee('Coop'), payee('Migros'), payee('SBB')];
  const visible = [payees[1]!, payees[2]!];

  test('returns the Payee the URL names, even when the filter hides it', () => {
    expect(selectPayee(payees, visible, 'p-Coop')?.name).toBe('Coop');
  });

  test('falls back to the first shown Payee', () => {
    expect(selectPayee(payees, visible, undefined)?.name).toBe('Migros');
    expect(selectPayee(payees, visible, 'p-gone')?.name).toBe('Migros');
  });

  test('returns nothing when no Payee is shown', () => {
    expect(selectPayee(payees, [], undefined)).toBeUndefined();
  });
});

describe('payeesByInitial', () => {
  test('sections the Payees by first letter, keeping their order', () => {
    const sections = payeesByInitial([payee('Amazon'), payee('apple'), payee('Coop')]);
    expect(sections.map((s) => [s.initial, s.payees.map((p) => p.name)])).toEqual([
      ['A', ['Amazon', 'apple']],
      ['C', ['Coop']],
    ]);
  });

  test('files an accented initial under its letter and anything else under #', () => {
    const sections = payeesByInitial([payee('7-Eleven'), payee('Écoles'), payee('Ebay')]);
    expect(sections.map((s) => [s.initial, s.payees.map((p) => p.name)])).toEqual([
      ['#', ['7-Eleven']],
      ['E', ['Écoles', 'Ebay']],
    ]);
  });
});

describe('payeeHref', () => {
  test('links to the Payee', () => {
    expect(payeeHref('p1', '')).toBe('/payees?payee=p1');
  });

  test('keeps the filter', () => {
    expect(payeeHref('p1', 'café & co')).toBe('/payees?payee=p1&q=caf%C3%A9+%26+co');
  });
});
