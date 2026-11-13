import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { CompletenessEntry, CompletenessProblem } from '@/server/services/completeness';
import { monthTicks, timelineOf } from './completeness-timeline';

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

/**
 * A row's words: its problems, worst first, then how current its data is. Left out for an
 * Account without data, where the problem ("No Import yet", "Stale") already says so, and for a
 * manual-only Account, which has no freshness.
 */
function rowWords(entry: CompletenessEntry, fmt: Formatter): string {
  const problems = entry.problems.map((problem) =>
    describeProblem(problem, entry.account.currency, fmt),
  );
  const hasFreshness =
    entry.isFreshnessChecked && (entry.dataEnd !== null || problems.length === 0);
  return [...problems, ...(hasFreshness ? [freshness(entry, fmt)] : [])].join(' · ');
}

/** Name, track, words: one column each from `md`, stacked below. */
const ROW_GRID = 'md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,18rem)]';

/**
 * One Account's coverage over the last 120 days (`TIMELINE_DAYS`): covered in navy, a Gap in the warning
 * token, Stale as the overdue run up to today, a mismatch as a diamond on its Statement balance
 * date. A manual-only Account has a dashed track with only its mismatch. Decorative: the row's
 * words say everything the track shows.
 */
function CoverageTrack({ entry, today }: { entry: CompletenessEntry; today: string }) {
  const { covered, gaps, overdue, mismatches } = timelineOf(entry, today);
  const at = (span: { left: number; width: number }) => ({
    left: `${span.left}%`,
    width: `${span.width}%`,
  });
  return (
    <div
      aria-hidden
      className={`relative h-3 rounded-full ${entry.isFreshnessChecked ? 'bg-sunken' : 'border border-dashed border-rule-strong'}`}
    >
      {covered && (
        <div className="absolute inset-y-0 rounded-full bg-hero-mid" style={at(covered)} />
      )}
      {overdue && (
        <div
          className="absolute inset-y-0 rounded-r-full border border-warning-rule bg-warning-tint"
          style={at(overdue)}
        />
      )}
      {gaps.map((gap, i) => (
        <div
          key={i}
          className="absolute -inset-y-0.5 min-w-1 rounded-sm bg-warning"
          style={at(gap)}
        />
      ))}
      {mismatches.map((left, i) => (
        <div
          key={i}
          className="absolute top-1/2 size-3.5 -translate-1/2 rotate-45 border-2 border-surface bg-warning"
          style={{ left: `${left}%` }}
        />
      ))}
    </div>
  );
}

function EntryRow({
  entry,
  fmt,
  today,
}: {
  entry: CompletenessEntry;
  fmt: Formatter;
  today: string;
}) {
  const hasProblems = entry.problems.length > 0;
  return (
    <li>
      <Link
        href={`/accounts/${entry.account.id}`}
        className={`grid gap-x-4 gap-y-1 rounded-md px-2 py-1.5 hover:bg-sunken md:items-center ${ROW_GRID}`}
      >
        <span className="font-medium break-words text-ink">
          {entry.account.bankName} · {entry.account.name}
        </span>
        <CoverageTrack entry={entry} today={today} />
        <span className={hasProblems ? 'font-medium text-warning' : 'text-muted'}>
          {rowWords(entry, fmt)}
        </span>
      </Link>
    </li>
  );
}

/** The key to the tracks' marks. Decorative, as the tracks are. */
function Legend() {
  const swatch = 'mr-1.5 inline-block align-middle';
  return (
    <p aria-hidden className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted">
      <span>
        <span className={`${swatch} h-2 w-4 rounded-full bg-hero-mid`} />
        Covered
      </span>
      <span>
        <span className={`${swatch} size-2 rounded-sm bg-warning`} />
        Gap
      </span>
      <span>
        <span
          className={`${swatch} h-2 w-4 rounded-full border border-warning-rule bg-warning-tint`}
        />
        Overdue
      </span>
      <span>
        <span className={`${swatch} size-2 rotate-45 bg-warning`} />
        Mismatch
      </span>
    </p>
  );
}

/** Month labels further right than this (in %) would run into "Today", so they are left out. */
const LAST_TICK_POSITION = 88;

/** The months under the tracks, then today at their right end. Only from `md`. */
function Axis({ today, fmt }: { today: string; fmt: Formatter }) {
  return (
    <div aria-hidden className={`mt-1 hidden gap-x-4 px-2 md:grid ${ROW_GRID}`}>
      <span />
      <div className="relative h-4 text-xs text-muted">
        {monthTicks(today)
          .filter(({ position }) => position <= LAST_TICK_POSITION)
          .map(({ month, position }) => (
            <span
              key={month}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${position}%` }}
            >
              {fmt.period(month)}
            </span>
          ))}
        <span className="absolute right-0">Today</span>
      </div>
      <span />
    </div>
  );
}

/**
 * The Completeness check's notice above the home Dashboard's grid of cards (ADR-0008): a card
 * with one row per checked Account, each a coverage track over the last 120 days (`TIMELINE_DAYS`) beside its
 * words. One neutral line when every Account is current, its list collapsed; open, announced as
 * an alert, with a warning headline and only the problem rows in the warning token when any
 * Account needs attention. A native disclosure: no client script.
 */
export function CompletenessNotice({
  entries,
  fmt,
  today,
}: {
  /** As `checkCompleteness` orders them: problem rows first, worst first. */
  entries: CompletenessEntry[];
  fmt: Formatter;
  /** The day the check ran for: the tracks' right end. */
  today: string;
}) {
  if (entries.length === 0) return null;
  const attention = entries.filter((entry) => entry.problems.length > 0).length;
  const needsAttention = attention > 0;
  return (
    <section
      aria-label="Completeness check"
      role={needsAttention ? 'alert' : undefined}
      className={`${CARD_CLASS} px-3 py-2.5 text-sm`}
    >
      <details open={needsAttention}>
        <summary
          className={`cursor-pointer px-2 ${needsAttention ? 'font-medium text-warning' : 'text-muted'}`}
        >
          {headline(entries, attention, fmt)}
        </summary>
        <Legend />
        <ul className="mt-2 flex flex-col">
          {entries.map((entry) => (
            <EntryRow key={entry.account.id} entry={entry} fmt={fmt} today={today} />
          ))}
        </ul>
        <Axis today={today} fmt={fmt} />
      </details>
    </section>
  );
}
