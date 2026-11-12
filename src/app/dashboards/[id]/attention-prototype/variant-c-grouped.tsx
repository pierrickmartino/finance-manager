/*
 * PROTOTYPE — throwaway. Variant C, "By problem": no single notice; three tiles in the
 * Dashboard's own card language, one per kind of trouble, each a count and the Accounts in it.
 * The question it answers first is "what kind of work is waiting", not "which Account".
 */

import Link from 'next/link';
import { TILE_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { CompletenessEntry, CompletenessProblemKind } from '@/server/services/completeness';
import {
  accountHref,
  accountName,
  allCurrentLine,
  earliestDataEnd,
  plural,
  problemDetail,
  problemRows,
} from './helpers';

export const VARIANT_C_NAME = 'Tiles by problem';

const GROUPS: { title: string; hint: string; kinds: CompletenessProblemKind[] }[] = [
  {
    title: "Doesn't add up",
    hint: 'Transactions differ from the latest Statement balance',
    kinds: ['mismatch'],
  },
  { title: 'Missing files', hint: 'Days no Import covers', kinds: ['gap'] },
  {
    title: 'Overdue',
    hint: 'No statement for over 40 days, or none yet',
    kinds: ['stale', 'never_imported'],
  },
];

export function VariantC({ entries, fmt }: { entries: CompletenessEntry[]; fmt: Formatter }) {
  const problems = problemRows(entries);
  const checked = entries.filter((entry) => entry.isFreshnessChecked).length;
  const earliest = earliestDataEnd(entries);
  if (problems.length === 0) {
    return (
      <p aria-label="Completeness check" className="text-sm text-muted">
        <span className="mr-2 inline-block size-2 rounded-full bg-positive" />
        {allCurrentLine(entries, fmt)}
      </p>
    );
  }
  return (
    <section aria-label="Completeness check" role="alert" className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        <span className="font-medium text-warning">
          {problems.length} of {entries.length} Accounts need attention
        </span>
        {earliest && ` · ${checked} imported, the oldest ends ${fmt.date(earliest)}`}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {GROUPS.map((group) => {
          const items = problems.flatMap((entry) =>
            entry.problems
              .filter((problem) => group.kinds.includes(problem.kind))
              .map((problem) => ({ entry, problem })),
          );
          const isClear = items.length === 0;
          return (
            <article
              key={group.title}
              className={`${TILE_CLASS} ${isClear ? '' : 'border-warning-rule'} flex flex-col gap-3`}
            >
              <header className="flex items-baseline justify-between gap-2">
                <h2 className="font-medium text-ink">{group.title}</h2>
                <span
                  className={`font-display text-3xl tabular-nums ${isClear ? 'text-faint' : 'text-warning'}`}
                >
                  {items.length}
                </span>
              </header>
              <p className="text-xs text-muted">{group.hint}</p>
              {isClear ? (
                <p className="text-sm text-positive">All clear</p>
              ) : (
                <ul className="flex flex-col divide-y divide-rule text-sm">
                  {items.map(({ entry, problem }, i) => (
                    <li key={i}>
                      <Link
                        href={accountHref(entry)}
                        className="flex flex-col py-1.5 hover:underline"
                      >
                        <span className="font-medium break-words text-ink">
                          {accountName(entry)}
                        </span>
                        <span className="text-warning tabular-nums">
                          {problem.kind === 'never_imported'
                            ? 'No Import yet'
                            : problemDetail(problem, entry, fmt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      <p className="sr-only">
        {problems.length} {plural(problems.length, 'Account', 'Accounts')} need attention
      </p>
    </section>
  );
}
