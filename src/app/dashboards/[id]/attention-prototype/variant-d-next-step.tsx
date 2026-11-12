/*
 * PROTOTYPE — throwaway. Variant D, "Next step first": a one-line banner that names only the
 * worst problem and the one action that fixes it; everything else waits behind "+N more".
 * Takes the least room above the Dashboard and turns the notice into a to-do.
 */

import Link from 'next/link';
import { PRIMARY_BUTTON_CLASS, WARNING_NOTICE_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { CompletenessEntry } from '@/server/services/completeness';
import {
  KIND_LABEL,
  NEXT_STEP,
  accountHref,
  accountName,
  allCurrentLine,
  plural,
  problemDetail,
  problemRows,
} from './helpers';

export const VARIANT_D_NAME = 'Next step first';

export function VariantD({ entries, fmt }: { entries: CompletenessEntry[]; fmt: Formatter }) {
  const problems = problemRows(entries);
  if (problems.length === 0) {
    return (
      <p aria-label="Completeness check" className="text-sm text-muted">
        ✓ {allCurrentLine(entries, fmt)}
      </p>
    );
  }
  const worst = problems[0]!;
  const worstProblem = worst.problems[0]!;
  const rest = problems.flatMap((entry, e) =>
    entry.problems.slice(e === 0 ? 1 : 0).map((problem) => ({ entry, problem })),
  );
  return (
    <section
      aria-label="Completeness check"
      role="alert"
      className={`${WARNING_NOTICE_CLASS} px-4 py-3 text-sm`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-warning font-bold text-surface"
        >
          !
        </span>
        <p className="min-w-0 flex-1">
          <span className="font-medium">
            {accountName(worst)} — {KIND_LABEL[worstProblem.kind].toLowerCase()}
          </span>{' '}
          <span className="text-ink-soft">{problemDetail(worstProblem, worst, fmt)}</span>
        </p>
        <Link href={accountHref(worst)} className={PRIMARY_BUTTON_CLASS}>
          {NEXT_STEP[worstProblem.kind]}
        </Link>
      </div>
      {rest.length > 0 && (
        <details className="mt-2 pl-11">
          <summary className="cursor-pointer font-medium">
            +{rest.length} more {plural(rest.length, 'problem', 'problems')} on {problems.length}{' '}
            {plural(problems.length, 'Account', 'Accounts')}
          </summary>
          <ol className="mt-2 flex flex-col gap-1.5">
            {rest.map(({ entry, problem }, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3">
                <span className="w-5 text-right text-xs text-muted tabular-nums">{i + 2}.</span>
                <Link href={accountHref(entry)} className="font-medium hover:underline">
                  {accountName(entry)}
                </Link>
                <span>{KIND_LABEL[problem.kind]}</span>
                <span className="text-ink-soft">{problemDetail(problem, entry, fmt)}</span>
                <Link href={accountHref(entry)} className="text-xs text-accent-ink hover:underline">
                  {NEXT_STEP[problem.kind]} →
                </Link>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
