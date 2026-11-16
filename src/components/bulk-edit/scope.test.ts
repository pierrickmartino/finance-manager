import { describe, expect, test } from 'vitest';
import { scopeInput, type BulkScope } from './scope';

describe('scopeInput', () => {
  test('passes picked ids as the ids scope', () => {
    expect(scopeInput({ transactionIds: ['a', 'b'] })).toEqual({ transactionIds: ['a', 'b'] });
  });

  test('passes a group key as the group scope', () => {
    expect(scopeInput({ groupKey: 'migros' })).toEqual({ groupKey: 'migros' });
  });

  test('passes a filter as the filter scope', () => {
    expect(scopeInput({ filter: { text: 'coop' } })).toEqual({ filter: { text: 'coop' } });
  });

  test("lets only the scope's own field through when a client sends more", () => {
    // A server action's argument comes from the client, whatever its type says.
    const sent = {
      transactionIds: ['a'],
      groupKey: 'migros',
      changes: { categoryId: 'c' },
    } as unknown as BulkScope;

    expect(scopeInput(sent)).toEqual({ groupKey: 'migros' });
    expect(scopeInput({ ...sent, filter: { text: 'coop' } } as BulkScope)).toEqual({
      filter: { text: 'coop' },
    });
  });
});
