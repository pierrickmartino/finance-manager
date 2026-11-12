'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import { TILE_CLASS } from '@/components/surface';
import { findMonthFlows, spendingInsight } from '@/lib/reporting/overview';
import { storyHero } from '@/lib/reporting/story';
import { FigureLink } from '../figure-link';
import type { StoryChapter } from '../story/chapter';
import { Sparkline } from './marks';

/** A recent Transaction, as the Dashboard's activity card lists it. */
export interface RecentActivity {
  id: string;
  name: string;
  category: string;
  bookingDate: string;
  amountMinor: number;
  currency: string;
}

/**
 * The opening number (net worth, else the first Widget's total) and, from an income-vs-expense
 * Widget, what was kept over its periods, drawn as a running line.
 */
export function NetWorthCard({ chapters }: { chapters: StoryChapter[] }) {
  const fmt = useFormatter();
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const hero = storyHero(chapters);
  if (!hero) return null;
  const flow = findMonthFlows(chapters);
  const nets = flow?.months.map((month) => month.net) ?? [];
  const kept = nets.reduce((total, net) => total + net, 0);
  return (
    <section
      aria-labelledby="overview-headline"
      className={`${TILE_CLASS} bg-gradient-to-br from-hero-mist/30 to-surface`}
    >
      <h2 id="overview-headline" className="font-medium">
        {hero.label}
      </h2>
      <div className="mt-4 grid grid-cols-[auto_1fr] items-end gap-4">
        <div>
          <Link
            href={hero.href}
            className="font-display text-4xl tracking-tight tabular-nums hover:underline"
          >
            {money(hero.value)}
          </Link>
          {flow && (
            <p className="mt-2 text-sm text-muted">
              <FigureLink
                href={flow.href}
                className={kept >= 0 ? 'text-positive' : 'text-negative'}
              >
                <span aria-hidden>{kept >= 0 ? '↗' : '↘'}</span> {money(kept)}
              </FigureLink>{' '}
              kept over {nets.length} months
            </p>
          )}
        </div>
        <Sparkline values={nets} />
      </div>
    </section>
  );
}

/** One sentence on how the latest full month compares, in the hero's navy. */
export function InsightCard({ chapters }: { chapters: StoryChapter[] }) {
  const flow = findMonthFlows(chapters);
  const insight = flow ? spendingInsight(flow.months) : null;
  if (!flow || !insight) return null;
  const [before, change, after] = insight.detail;
  return (
    <section
      aria-labelledby="overview-insight"
      className="flex min-h-56 flex-col justify-between rounded-3xl bg-insight p-6 text-on-hero shadow-lg"
    >
      <div>
        <h2 id="overview-insight" className="font-display text-3xl leading-tight tracking-tight">
          {insight.headline}
        </h2>
        <p className="mt-3 max-w-sm text-on-hero/80">
          {before}
          <FigureLink
            href={flow.changeHref}
            className={flow.changeHref ? 'underline underline-offset-4' : ''}
          >
            {change}
          </FigureLink>
          {after}
        </p>
      </div>
      {flow.latestHref && (
        <Link
          href={flow.latestHref}
          className="mt-6 self-start rounded-lg bg-on-hero px-5 py-2.5 text-sm font-medium text-hero shadow-lg hover:bg-on-hero/90"
        >
          See the Transactions
        </Link>
      )}
    </section>
  );
}

/** Monogram tones, from the hero's navy and the ink: decoration, never meaning. */
// Not `bg-hero`: that name is the hero's gradient utility (globals.css), not its flat colour.
const MONOGRAM_TONES = ['bg-hero-deep', 'bg-hero-mid', 'bg-hero-glow', 'bg-ink-soft'];

function monogramTone(name: string): string {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return MONOGRAM_TONES[hash % MONOGRAM_TONES.length]!;
}

/** The latest Transactions, newest first, each opening its page. */
export function RecentActivityCard({ recent }: { recent: RecentActivity[] }) {
  const fmt = useFormatter();
  return (
    <section aria-labelledby="overview-recent" className={`${TILE_CLASS} lg:row-span-2`}>
      <div className="flex items-center justify-between">
        <h2 id="overview-recent" className="font-medium">
          Recent activity
        </h2>
        <Link href="/transactions" className="text-sm text-muted hover:text-ink">
          View all
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No Transactions yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {recent.map((transaction) => (
            <li key={transaction.id}>
              <Link
                href={`/transactions/${transaction.id}`}
                className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-2.5 hover:bg-sunken"
              >
                <span
                  aria-hidden
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-semibold text-on-hero ${monogramTone(transaction.name)}`}
                >
                  {transaction.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{transaction.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {transaction.category} · {fmt.date(transaction.bookingDate)}
                  </span>
                </span>
                <span
                  className={`text-sm font-medium whitespace-nowrap tabular-nums ${transaction.amountMinor > 0 ? 'text-positive' : 'text-negative'}`}
                >
                  {transaction.amountMinor > 0 ? '+' : ''}
                  {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
