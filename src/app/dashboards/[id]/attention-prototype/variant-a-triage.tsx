/*
 * PROTOTYPE — throwaway. Variant A, "Triage table": a card with a summary of problem kinds and a
 * table of problem Accounts, each with the next step to take. Healthy Accounts fold away below.
 */

import Link from 'next/link';
import { CARD_CLASS, SMALL_BUTTON_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { CompletenessEntry } from '@/server/services/completeness';
import {
  KIND_LABEL,
  NEXT_STEP,
  accountHref,
  accountName,
  allCurrentLine,
  healthyRows,
  kindCounts,
  plural,
  problemDetail,
  problemRows,
} from './helpers';

export const VARIANT_A_NAME = 'Triage table';

function HealthyList({ entries, fmt }: { entries: CompletenessEntry[]; fmt: Formatter }) {
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {entries.map((entry) => (
        <li key={entry.account.id}>
          <Link href={accountHref(entry)} className="flex flex-wrap gap-x-3 hover:underline">
            <span className="font-medium text-ink">{accountName(entry)}</span>
            <span className="text-muted">
              {entry.dataEnd ? `Data ends ${fmt.date(entry.dataEnd)}` : 'Manual'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function VariantA({ entries, fmt }: { entries: CompletenessEntry[]; fmt: Formatter }) {
  const problems = problemRows(entries);
  const healthy = healthyRows(entries);
  if (problems.length === 0) {
    return (
      <section aria-label="Completeness check" className="text-sm">
        <details>
          <summary className="cursor-pointer text-muted">
            <span className="mr-2 inline-block size-2 rounded-full bg-positive" />
            {allCurrentLine(entries, fmt)}
          </summary>
          <HealthyList entries={healthy} fmt={fmt} />
        </details>
      </section>
    );
  }

  return (
    <section
      aria-label="Completeness check"
      role="alert"
      className={`${CARD_CLASS} overflow-hidden border-warning-rule text-sm`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-warning-tint px-4 py-3">
        <h2 className="font-display text-lg text-warning">
          {problems.length} {plural(problems.length, 'Account needs', 'Accounts need')} attention
        </h2>
        <ul className="flex flex-wrap gap-1.5">
          {kindCounts(entries).map(({ kind, count }) => (
            <li
              key={kind}
              className="rounded-md border border-warning-rule bg-surface px-2 py-0.5 text-xs font-medium text-warning"
            >
              {count} {KIND_LABEL[kind]}
            </li>
          ))}
        </ul>
      </header>

      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1.4fr)_14rem] gap-x-4 border-b border-rule px-4 py-2 text-xs text-muted md:grid">
        <span>Account</span>
        <span>Problem</span>
        <span>Details</span>
        <span className="text-right">Next step</span>
      </div>
      <ul className="divide-y divide-rule">
        {problems.flatMap((entry) =>
          entry.problems.map((problem, i) => (
            <li
              key={`${entry.account.id}-${i}`}
              className="grid gap-x-4 gap-y-1 px-4 py-2.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1.4fr)_14rem] md:items-center"
            >
              <span className="font-medium break-words text-ink">
                {i === 0 ? accountName(entry) : ''}
              </span>
              <span className="font-medium text-warning">{KIND_LABEL[problem.kind]}</span>
              <span className="text-ink-soft tabular-nums">
                {problemDetail(problem, entry, fmt)}
              </span>
              <Link
                href={accountHref(entry)}
                className={`${SMALL_BUTTON_CLASS} justify-self-start md:justify-self-end`}
              >
                {NEXT_STEP[problem.kind]} →
              </Link>
            </li>
          )),
        )}
      </ul>

      {healthy.length > 0 && (
        <details className="border-t border-rule px-4 py-2.5">
          <summary className="cursor-pointer text-muted">
            {healthy.length} other {plural(healthy.length, 'Account', 'Accounts')} current
          </summary>
          <HealthyList entries={healthy} fmt={fmt} />
        </details>
      )}
    </section>
  );
}
