import Link from 'next/link';
import { WARNING_NOTICE_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { CompletenessEntry, CompletenessProblem } from '@/server/services/completeness';

/** The word for `count` of something: `one` for exactly one, `many` otherwise. */
function pluralise(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** A count of Accounts in words: "1 Account", "3 Accounts". */
function accountCountLabel(count: number): string {
  return `${count} ${pluralise(count, 'Account', 'Accounts')}`;
}

/** One problem in words, as its row lists it; amounts in the Account's own Currency. */
function describeProblem(problem: CompletenessProblem, currency: string, fmt: Formatter): string {
  switch (problem.kind) {
    case 'mismatch':
      return `Mismatch of ${fmt.amount(problem.differenceMinor, { currency })} on ${fmt.date(problem.statementDate)}`;
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
  if (attention > 0) {
    return `${accountCountLabel(attention)} ${pluralise(attention, 'needs', 'need')} attention`;
  }
  // Manual-only Accounts are listed only for a mismatch: "current" speaks of the others.
  const checked = entries.filter((entry) => entry.isFreshnessChecked);
  const earliest = earliestDataEnd(checked);
  const current = `${checked.length === 1 ? '' : 'All '}${accountCountLabel(checked.length)} current`;
  return earliest ? `${current} to ${fmt.date(earliest)}` : current;
}

function freshness(entry: CompletenessEntry, fmt: Formatter): string {
  if (entry.dataEnd === null || entry.daysSince === null) return 'No data yet';
  const days = `${entry.daysSince} ${pluralise(entry.daysSince, 'day', 'days')}`;
  return `Data ends ${fmt.date(entry.dataEnd)} · ${days} ago`;
}

function EntryRow({ entry, fmt }: { entry: CompletenessEntry; fmt: Formatter }) {
  const hasProblems = entry.problems.length > 0;
  return (
    <li className={hasProblems ? 'text-warning' : 'text-ink'}>
      <Link
        href={`/accounts/${entry.account.id}`}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 hover:underline"
      >
        <span className="font-medium break-words">
          {entry.account.bankName} · {entry.account.name}
        </span>
        {entry.isFreshnessChecked && (
          <span className={hasProblems ? undefined : 'text-muted'}>{freshness(entry, fmt)}</span>
        )}
        {hasProblems && (
          <span className="font-medium">
            {entry.problems
              .map((problem) => describeProblem(problem, entry.account.currency, fmt))
              .join(' · ')}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * The Completeness check's notice above the home Dashboard's Hero (ADR-0008). One neutral line
 * when every Account is current, its list collapsed; open, as a warning notice announced as an
 * alert when any Account needs attention, with only the problem rows in the warning token. A
 * native disclosure: no client script.
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
      className={`mt-4 text-sm ${needsAttention ? WARNING_NOTICE_CLASS : 'text-ink'}`}
    >
      <details open={needsAttention}>
        <summary className={`cursor-pointer ${needsAttention ? 'font-medium' : 'text-muted'}`}>
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
