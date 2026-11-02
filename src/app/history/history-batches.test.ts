import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@/server/services/history';
import { groupHistoryBatches } from './history-batches';

function entry(id: string, batchId: string, field: string, at = '2026-10-01T10:00:00Z') {
  return {
    id,
    batchId,
    at: new Date(at),
    actorType: 'manual',
    actorId: null,
    entityType: 'transaction',
    entityId: 'tx',
    field,
    before: null,
    after: 'x',
  } satisfies HistoryEntry;
}

describe('History grouped by Batch', () => {
  it('returns nothing for no entries', () => {
    expect(groupHistoryBatches([])).toEqual([]);
  });

  it('puts the entries one change wrote together, in their order', () => {
    const batches = groupHistoryBatches([
      entry('1', 'b2', 'notes', '2026-10-02T10:00:00Z'),
      entry('2', 'b2', 'tags', '2026-10-02T10:00:00Z'),
      entry('3', 'b1', 'amountMinor'),
    ]);
    expect(batches.map((batch) => batch.batchId)).toEqual(['b2', 'b1']);
    expect(batches[0]!.entries.map((e) => e.field)).toEqual(['notes', 'tags']);
    expect(batches[1]!.entries.map((e) => e.field)).toEqual(['amountMinor']);
  });

  it('takes the time and actor of a Batch from its first entry', () => {
    const [batch] = groupHistoryBatches([
      { ...entry('1', 'b1', 'category'), actorType: 'rule', actorId: 'r1' },
    ]);
    expect(batch).toMatchObject({
      at: new Date('2026-10-01T10:00:00Z'),
      actorType: 'rule',
      actorId: 'r1',
    });
  });

  it('keeps a Batch that reappears later apart from its first run of entries', () => {
    const batches = groupHistoryBatches([
      entry('1', 'b1', 'notes'),
      entry('2', 'b2', 'tags'),
      entry('3', 'b1', 'payee'),
    ]);
    expect(batches.map((batch) => batch.batchId)).toEqual(['b1', 'b2', 'b1']);
  });
});
