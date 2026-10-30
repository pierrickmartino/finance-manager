import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
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
} from '@/server/services/history';
import { HistoryTable } from './history-table';

export const metadata: Metadata = { title: 'History · Finance Manager' };

const FILTER_FIELDS = ['from', 'to', 'entityType', 'entityId', 'actorType', 'batchId'] as const;
type FilterValues = Record<(typeof FILTER_FIELDS)[number], string>;

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

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
        <div>
          <HistoryTable entries={entries} fmt={fmt} />
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
