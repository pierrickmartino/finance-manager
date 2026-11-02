import type { HistoryEntry } from '@/server/services/history';

/** The entries one change wrote, with the change's time and actor. */
export interface HistoryBatch {
  batchId: string;
  at: Date;
  actorType: HistoryEntry['actorType'];
  actorId: string | null;
  entries: HistoryEntry[];
}

/**
 * Groups consecutive History entries of the same Batch, keeping their order. History is
 * listed by time, so a Batch's entries sit together.
 */
export function groupHistoryBatches(entries: readonly HistoryEntry[]): HistoryBatch[] {
  return entries.reduce<HistoryBatch[]>((batches, entry) => {
    const last = batches.at(-1);
    if (last?.batchId === entry.batchId) {
      return [...batches.slice(0, -1), { ...last, entries: [...last.entries, entry] }];
    }
    const { batchId, at, actorType, actorId } = entry;
    return [...batches, { batchId, at, actorType, actorId, entries: [entry] }];
  }, []);
}
