import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { HistoryEntry, JsonValue } from '@/server/services/history';

const CELL = 'px-3 py-2 text-left align-top';

const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Renders a recorded value. Fields ending in "Minor" hold amounts in minor units. */
function renderValue(field: string, value: JsonValue, fmt: Formatter): string {
  if (value === null) return '—';
  if (typeof value === 'number' && field.endsWith('Minor')) return fmt.amount(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** A link to the History page with these filters. */
export function historyHref(filter: Record<string, string>): string {
  const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value));
  return `/history?${query.toString()}`;
}

interface HistoryTableProps {
  entries: HistoryEntry[];
  fmt: Formatter;
  /** Accessible name of the table. */
  label?: string;
}

/** History entries, one row per changed field (spec 115, 116). */
export function HistoryTable({ entries, fmt, label = 'History entries' }: HistoryTableProps) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full text-sm">
        <thead className="border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className={CELL}>When</th>
            <th className={CELL}>Actor</th>
            <th className={CELL}>Entity</th>
            <th className={CELL}>Field</th>
            <th className={CELL}>Before</th>
            <th className={CELL}>After</th>
            <th className={CELL}>Batch</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className={`${CELL} whitespace-nowrap tabular-nums`}>
                {fmt.date(entry.at)} {TIME.format(entry.at)}
              </td>
              <td className={CELL}>
                {entry.actorType}
                {entry.actorId && <span className="text-zinc-500"> {entry.actorId}</span>}
              </td>
              <td className={CELL}>
                <Link
                  href={historyHref({ entityType: entry.entityType, entityId: entry.entityId })}
                  className="hover:underline"
                >
                  {entry.entityType}
                </Link>
                <div className="font-mono text-xs text-zinc-500">{entry.entityId}</div>
              </td>
              <td className={CELL}>{entry.field}</td>
              <td className={`${CELL} break-all`}>{renderValue(entry.field, entry.before, fmt)}</td>
              <td className={`${CELL} break-all`}>{renderValue(entry.field, entry.after, fmt)}</td>
              <td className={CELL}>
                <Link
                  href={historyHref({ batchId: entry.batchId })}
                  className="font-mono text-xs hover:underline"
                  title={entry.batchId}
                >
                  {entry.batchId.slice(0, 8)}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
