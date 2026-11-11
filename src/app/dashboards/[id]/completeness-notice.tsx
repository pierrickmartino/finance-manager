import Link from 'next/link';
import { WARNING_NOTICE_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { CompletenessEntry, CompletenessProblem } from '@/server/services/completeness';

/** A count of Accounts in words: "1 Account", "3 Accounts". */
function accounts(count: number): string {
  return `${count} ${count === 1 ? 'Account' : 'Accounts'}`;
}

/** One problem in words, as its row lists it. */
function describeProblem(problem: CompletenessProblem, fmt: Formatter): string {
  switch (problem.kind) {
    case 'gap':
      return problem.from === problem.to
        ? `Gap ${fmt.date(problem.from)}`
        : `Gap ${fmt.date(problem.from)} – ${fmt.date(problem.to)}`;
    case 'stale':
      return 'Stale';
    case 'never_imported':
      return 'No Import yet';
  }
}

/** The earliest data end among the entries: how current the reports really are. */
function earliestDataEnd(entries: CompletenessEntry[]): string | null {
  const ends = entries.flatMap((entry) => (entry.dataEnd ? [entry.dataEnd] : []));
  return ends.length === 0 ? null : ends.reduce((a, b) => (a < b ? a : b));
}

function headline(entries: CompletenessEntry[], attention: number, fmt: Formatter): string {
  if (attention > 0)
    return `${accounts(attention)} ${attention === 1 ? 'needs' : 'need'} attention`;
  const earliest = earliestDataEnd(entries);
  const all = `All ${accounts(entries.length)} current`;
  return earliest ? `${all} to ${fmt.date(earliest)}` : all;
}

function freshness(entry: CompletenessEntry, fmt: Formatter): string {
  if (entry.dataEnd === null || entry.daysSince === null) return 'No data yet';
  const days = entry.daysSince === 1 ? '1 day' : `${entry.daysSince} days`;
  return `Data ends ${fmt.date(entry.dataEnd)} · ${days} ago`;
}

function EntryRow({ entry, fmt }: { entry: CompletenessEntry; fmt: Formatter }) {
  const hasProblems = entry.problems.length > 0;
  return (
    <li className={hasProblems ? WARNING_NOTICE_CLASS : 'px-3 py-1 text-ink'}>
      <Link
        href={`/accounts/${entry.account.id}`}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 hover:underline"
      >
        <span className="font-medium break-words">
          {entry.account.bankName} · {entry.account.name}
        </span>
        <span className={hasProblems ? undefined : 'text-muted'}>{freshness(entry, fmt)}</span>
        {hasProblems && (
          <span className="font-medium">
            {entry.problems.map((problem) => describeProblem(problem, fmt)).join(' · ')}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * The Completeness check's notice above the home Dashboard's Hero (ADR-0008). One neutral line
 * when every Account is current, its list collapsed; open, in the warning token and announced as
 * an alert when any Account needs attention. A native disclosure: no client script.
 */
export function CompletenessNotice({
  entries,
  fmt,
}: {
  /** As `checkCompleteness` orders them: problem rows first, worst first. */
  entries: CompletenessEntry[];
  fmt: Formatter;
}) {
  if (entries.length === 0) return null;
  const attention = entries.filter((entry) => entry.problems.length > 0).length;
  const needsAttention = attention > 0;
  return (
    <section
      aria-label="Completeness check"
      role={needsAttention ? 'alert' : undefined}
      className="mt-4 text-sm"
    >
      <details open={needsAttention}>
        <summary
          className={`cursor-pointer ${needsAttention ? 'font-medium text-warning' : 'text-muted'}`}
        >
          {headline(entries, attention, fmt)}
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {entries.map((entry) => (
            <EntryRow key={entry.account.id} entry={entry} fmt={fmt} />
          ))}
        </ul>
      </details>
    </section>
  );
}
