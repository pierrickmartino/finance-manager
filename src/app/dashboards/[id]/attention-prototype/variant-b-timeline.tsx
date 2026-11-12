/*
 * PROTOTYPE — throwaway. Variant B, "Coverage timeline": every checked Account as a track over
 * the last 120 days, so a Gap is a hole, Stale is the empty run up to today and a mismatch is a
 * marker on its Statement balance date. Shows freshness as a picture rather than as words.
 */

import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { CompletenessEntry } from '@/server/services/completeness';
import { addDays, daysBetween } from '@/server/services/fx/dates';
import {
  KIND_LABEL,
  accountHref,
  accountName,
  allCurrentLine,
  plural,
  problemDetail,
  problemRows,
} from './helpers';

export const VARIANT_B_NAME = 'Coverage timeline';

const WINDOW_DAYS = 120;

function pct(windowStart: string, date: string): number {
  const days = Math.min(WINDOW_DAYS, Math.max(0, daysBetween(windowStart, date)));
  return (days / WINDOW_DAYS) * 100;
}

function Track({ entry, today }: { entry: CompletenessEntry; today: string }) {
  const start = addDays(today, -WINDOW_DAYS);
  const end = entry.dataEnd ? pct(start, entry.dataEnd) : 0;
  const isManual = !entry.isFreshnessChecked;
  return (
    <div
      className={`relative h-3 rounded-full ${isManual ? 'border border-dashed border-rule-strong' : 'bg-sunken'}`}
    >
      {!isManual && end > 0 && (
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-hero-mid"
          style={{ width: `${end}%` }}
        />
      )}
      {!isManual && entry.problems.some((p) => p.kind === 'stale') && (
        <div
          className="absolute inset-y-0 rounded-r-full border border-warning-rule bg-warning-tint"
          style={{ left: `${end}%`, right: 0 }}
        />
      )}
      {entry.problems.map((problem, i) => {
        if (problem.kind === 'gap') {
          const left = pct(start, problem.from);
          const right = pct(start, addDays(problem.to, 1));
          return (
            <div
              key={i}
              className="absolute -inset-y-0.5 rounded-sm bg-warning"
              style={{ left: `${left}%`, width: `${Math.max(1, right - left)}%` }}
            />
          );
        }
        if (problem.kind === 'mismatch') {
          return (
            <div
              key={i}
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-surface bg-warning"
              style={{ left: `${pct(start, problem.statementDate)}%` }}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function Row({ entry, fmt, today }: { entry: CompletenessEntry; fmt: Formatter; today: string }) {
  const hasProblems = entry.problems.length > 0;
  return (
    <li>
      <Link
        href={accountHref(entry)}
        className="grid gap-x-4 gap-y-1 rounded-md px-2 py-1.5 hover:bg-sunken md:grid-cols-[14rem_minmax(0,1fr)_16rem] md:items-center"
      >
        <span className={`font-medium break-words ${hasProblems ? 'text-ink' : 'text-ink-soft'}`}>
          {accountName(entry)}
        </span>
        <Track entry={entry} today={today} />
        <span className={hasProblems ? 'font-medium text-warning' : 'text-muted'}>
          {hasProblems
            ? entry.problems
                .map((p) => `${KIND_LABEL[p.kind]}: ${problemDetail(p, entry, fmt)}`)
                .join(' · ')
            : entry.dataEnd
              ? `${entry.daysSince} ${plural(entry.daysSince ?? 0, 'day', 'days')} ago`
              : 'Manual'}
        </span>
      </Link>
    </li>
  );
}

export function VariantB({
  entries,
  fmt,
  today,
}: {
  entries: CompletenessEntry[];
  fmt: Formatter;
  today: string;
}) {
  const problems = problemRows(entries);
  const start = addDays(today, -WINDOW_DAYS);
  const ticks = [0, 30, 60, 90].map((ago) => addDays(today, -WINDOW_DAYS + ago));
  const needsAttention = problems.length > 0;
  return (
    <section
      aria-label="Completeness check"
      role={needsAttention ? 'alert' : undefined}
      className={`${CARD_CLASS} px-3 py-3 text-sm`}
    >
      <details open={needsAttention}>
        <summary className="cursor-pointer px-2">
          <span className={needsAttention ? 'font-medium text-warning' : 'text-muted'}>
            {needsAttention
              ? `${problems.length} ${plural(problems.length, 'Account needs', 'Accounts need')} attention`
              : allCurrentLine(entries, fmt)}
          </span>
          <span className="ml-3 text-xs text-muted">
            <span className="mr-1 inline-block h-2 w-4 rounded-full bg-hero-mid align-middle" />{' '}
            covered
            <span className="mr-1 ml-3 inline-block h-2 w-2 rounded-sm bg-warning align-middle" />{' '}
            Gap
            <span className="mr-1 ml-3 inline-block h-2 w-4 rounded-full border border-warning-rule bg-warning-tint align-middle" />{' '}
            overdue
            <span className="mr-1 ml-3 inline-block size-2 rotate-45 bg-warning align-middle" />{' '}
            mismatch
          </span>
        </summary>
        <ul className="mt-3 flex flex-col">
          {entries.map((entry) => (
            <Row key={entry.account.id} entry={entry} fmt={fmt} today={today} />
          ))}
        </ul>
        <div className="mt-1 hidden grid-cols-[14rem_minmax(0,1fr)_16rem] gap-x-4 px-2 md:grid">
          <span />
          <div className="relative h-4 text-xs text-muted">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute -translate-x-1/2"
                style={{ left: `${pct(start, tick)}%` }}
              >
                {fmt.date(tick)}
              </span>
            ))}
            <span className="absolute right-0">Today</span>
          </div>
          <span />
        </div>
      </details>
    </section>
  );
}
