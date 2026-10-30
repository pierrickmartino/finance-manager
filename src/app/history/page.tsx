import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { ServiceError } from '@/server/services/errors';
import {
  ACTOR_TYPES,
  DEFAULT_HISTORY_LIMIT,
  HISTORY_ENTITY_TYPES,
  listHistory,
  type HistoryEntry,
  type HistoryFilter,
  type JsonValue,
} from '@/server/services/history';

export const metadata: Metadata = { title: 'History · Finance Manager' };

const FILTER_FIELDS = ['from', 'to', 'entityType', 'entityId', 'actorType', 'batchId'] as const;
type FilterValues = Record<(typeof FILTER_FIELDS)[number], string>;

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const CELL = 'px-3 py-2 text-left align-top';

const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface HistoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readFilter(params: Record<string, string | string[] | undefined>): FilterValues {
  const entries = FILTER_FIELDS.map((field) => {
    const value = params[field];
    return [field, typeof value === 'string' ? value : ''] as const;
  });
  return Object.fromEntries(entries) as FilterValues;
}

async function loadHistory(
  filter: HistoryFilter,
): Promise<{ entries: HistoryEntry[]; error: string | null }> {
  try {
    return { entries: await listHistory(await getServiceContext(), filter), error: null };
  } catch (error: unknown) {
    if (error instanceof ServiceError) return { entries: [], error: error.message };
    throw error;
  }
}

/** Renders a recorded value. Fields ending in "Minor" hold amounts in minor units. */
function renderValue(field: string, value: JsonValue, fmt: Formatter): string {
  if (value === null) return '—';
  if (typeof value === 'number' && field.endsWith('Minor')) return fmt.amount(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function filterHref(filter: Partial<FilterValues>): string {
  const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value));
  return `/history?${query.toString()}`;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const filter = readFilter(await searchParams);
  const [{ entries, error }, fmt] = await Promise.all([loadHistory(filter), getFormatter()]);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">History</h1>

      {/* Keyed on the filter so the fields follow client-side navigation between filters. */}
      <form
        key={JSON.stringify(filter)}
        method="get"
        action="/history"
        aria-label="Filter History"
        className="flex flex-wrap items-end gap-3"
      >
        <FilterInput label="From" name="from" type="date" value={filter.from} />
        <FilterInput label="To" name="to" type="date" value={filter.to} />
        <FilterSelect
          label="Entity"
          name="entityType"
          value={filter.entityType}
          options={HISTORY_ENTITY_TYPES}
        />
        <FilterInput label="Entity id" name="entityId" value={filter.entityId} />
        <FilterSelect
          label="Actor"
          name="actorType"
          value={filter.actorType}
          options={ACTOR_TYPES}
        />
        <FilterInput label="Batch" name="batchId" value={filter.batchId} />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Filter
        </button>
        <Link href="/history" className="py-1.5 text-sm underline">
          Clear
        </Link>
      </form>

      {error && <FieldError message={error} />}

      {entries.length === 0 ? (
        !error && <p className="text-sm text-zinc-500">No History entries match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="History entries" className="w-full text-sm">
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
                      href={filterHref({ entityType: entry.entityType, entityId: entry.entityId })}
                      className="hover:underline"
                    >
                      {entry.entityType}
                    </Link>
                    <div className="font-mono text-xs text-zinc-500">{entry.entityId}</div>
                  </td>
                  <td className={CELL}>{entry.field}</td>
                  <td className={`${CELL} break-all`}>
                    {renderValue(entry.field, entry.before, fmt)}
                  </td>
                  <td className={`${CELL} break-all`}>
                    {renderValue(entry.field, entry.after, fmt)}
                  </td>
                  <td className={CELL}>
                    <Link
                      href={filterHref({ batchId: entry.batchId })}
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
          {entries.length === DEFAULT_HISTORY_LIMIT && (
            <p className="mt-2 text-sm text-zinc-500">
              Showing the newest {DEFAULT_HISTORY_LIMIT} entries. Narrow the filters to see older
              ones.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

interface FilterInputProps {
  label: string;
  name: string;
  value: string;
  type?: string;
}

function FilterInput({ label, name, value, type = 'text' }: FilterInputProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input name={name} type={type} defaultValue={value} className={INPUT} />
    </label>
  );
}

interface FilterSelectProps {
  label: string;
  name: string;
  value: string;
  options: readonly string[];
}

function FilterSelect({ label, name, value, options }: FilterSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <select name={name} defaultValue={value} className={INPUT}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
