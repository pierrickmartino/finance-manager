import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { HistoryEntry } from '@/server/services/history';
import { groupHistoryBatches } from './history-batches';
import { HistoryActor, historyHref, renderValue } from './history-table';

interface HistoryTimelineProps {
  entries: HistoryEntry[];
  fmt: Formatter;
  /** Accessible name of the list. */
  label: string;
}

/**
 * History as a timeline: one point per change (Batch), with when, who, and each field it
 * changed from its old value to its new one. The compact sibling of HistoryTable.
 */
export function HistoryTimeline({ entries, fmt, label }: HistoryTimelineProps) {
  return (
    <ol
      aria-label={label}
      className="flex flex-col gap-4 border-l border-zinc-200 pl-5 dark:border-zinc-800"
    >
      {groupHistoryBatches(entries).map((batch, index) => (
        <li key={`${batch.batchId}-${index}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full bg-zinc-400 ring-4 ring-zinc-50 dark:bg-zinc-500 dark:ring-zinc-950"
          />
          <p className="text-xs text-zinc-500">
            <Link href={historyHref({ batchId: batch.batchId })} className="hover:underline">
              {fmt.dateTime(batch.at)}
            </Link>{' '}
            · <HistoryActor actorType={batch.actorType} actorId={batch.actorId} />
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {batch.entries.map((entry) => (
              <li key={entry.id} className="break-words">
                <span className="text-zinc-500">{entry.field}</span>{' '}
                {entry.before !== null && (
                  <>
                    <del className="text-zinc-400">
                      {renderValue(entry.field, entry.before, fmt)}
                    </del>{' '}
                    →{' '}
                  </>
                )}
                {renderValue(entry.field, entry.after, fmt)}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
