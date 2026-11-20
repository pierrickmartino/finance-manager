import Link from 'next/link';
import { HEADLINE_AMOUNT_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { windowPhrase, type PeriodView } from '@/lib/analytics/period-view';
import type { PeriodValue } from '@/lib/reporting/period-values';
import type { AnalyticsNetWorth } from '@/server/services/analytics';
import { accountsHref } from '../accounts/view';
import { NetWorthTrend } from './net-worth-trend';
import { SectionCard, SectionEmpty } from './section';

export const NET_WORTH = 'Net worth';

interface NetWorthSectionProps {
  netWorth: Promise<AnalyticsNetWorth>;
  view: PeriodView;
  fmt: Formatter;
}

/** A change's direction: its arrow, tone and the word that says it. */
function directionOf(change: number) {
  if (change > 0) return { arrow: '↗', tone: 'text-positive', word: 'up' };
  if (change < 0) return { arrow: '↘', tone: 'text-negative', word: 'down' };
  return { arrow: '→', tone: 'text-muted', word: 'unchanged' };
}

/** How far Net worth moved since the end of the previous period, opening the Accounts then. */
function NetWorthChange({
  change,
  fmt,
}: {
  change: NonNullable<AnalyticsNetWorth['change']>;
  fmt: Formatter;
}) {
  // Direction follows the whole francs shown, so a few cents never read as a move.
  const whole = Math.round(change.value / 100) * 100;
  const { arrow, tone, word } = directionOf(whole);
  const amount = fmt.amount(Math.abs(whole), { currency: 'CHF', isWhole: true });
  return (
    <p className="text-sm text-muted">
      <Link
        href={accountsHref({ date: change.since.date })}
        className={`${tone} tabular-nums hover:underline`}
      >
        <span aria-hidden>{arrow}</span> {word === 'unchanged' ? 'Unchanged' : `${word} ${amount}`}
      </Link>{' '}
      since the end of {change.since.label}
    </p>
  );
}

/**
 * Analytics' Net worth, once it arrives: Net worth today, a sparkline with a point per period
 * end of the window and today (each opening the Accounts as of its date), and the change since
 * the end of the previous period.
 */
export async function NetWorthSection({ netWorth, view, fmt }: NetWorthSectionProps) {
  const loaded = await netWorth;
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const unconverted = { count: loaded.unconvertedCount, of: 'Account' } as const;
  if (!loaded.today) {
    return (
      <SectionCard name={NET_WORTH} unconverted={unconverted}>
        <SectionEmpty>Nothing to show yet: no Account holds money.</SectionEmpty>
      </SectionCard>
    );
  }
  const points: PeriodValue[] = loaded.points.map((point) => ({
    label: point.isToDate ? 'Today' : `End of ${point.label}`,
    value: point.value,
    href: accountsHref({ date: point.date }),
    isPartial: point.isToDate,
  }));
  return (
    <SectionCard name={NET_WORTH} unconverted={unconverted}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Link
          href={accountsHref({ date: loaded.today.date })}
          aria-label={`Net worth today: ${money(loaded.today.value)}`}
          className={`${HEADLINE_AMOUNT_CLASS} shrink-0 hover:underline`}
        >
          {money(loaded.today.value)}
        </Link>
        <NetWorthTrend points={points} label={`Net worth over ${windowPhrase(view)}`} />
      </div>
      {loaded.change && <NetWorthChange change={loaded.change} fmt={fmt} />}
    </SectionCard>
  );
}
