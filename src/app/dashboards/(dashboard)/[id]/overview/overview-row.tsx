'use client';

import Link from 'next/link';
import { useFormatter } from '@/components/formatter-provider';
import { BADGE_CLASS, TILE_CLASS } from '@/components/surface';
import { readCard, type CardFlow, type WidgetCardData } from '@/lib/reporting/card';
import { headlineAmount, spendingInsight } from '@/lib/reporting/overview';
import { relativeDay, spotlight } from '@/lib/reporting/recent-activity';
import { FigureLink } from '../figure-link';
import { Sparkline } from './marks';

/** A recent Transaction, as the Dashboard's activity card lists it. */
export interface RecentActivity {
  id: string;
  name: string;
  category: string;
  bookingDate: string;
  /** Calendar days since the booking date, from the Swiss date: 0 is today. */
  daysAgo: number;
  amountMinor: number;
  currency: string;
}

type Money = (minor: number) => string;

/** The income and expense of the first card whose Widget holds both (the cards' own reading). */
function overviewFlow(chapters: WidgetCardData[], money: Money): CardFlow | null {
  for (const chapter of chapters) {
    const { flow } = readCard(chapter, money);
    if (flow) return flow;
  }
  return null;
}

/**
 * The opening number (net worth, else the first Widget's total) and, from an income-vs-expense
 * Widget, what was kept over its periods, drawn as a running line.
 */
export function NetWorthCard({ chapters }: { chapters: WidgetCardData[] }) {
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const hero = headlineAmount(chapters);
  if (!hero) return null;
  const flow = overviewFlow(chapters, money);
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
export function InsightCard({ chapters }: { chapters: WidgetCardData[] }) {
  const fmt = useFormatter();
  const flow = overviewFlow(chapters, (minor) => fmt.amount(minor, { currency: 'CHF' }));
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

/**
 * The latest Transactions, newest first: the largest of them in the spotlight, in the hero's
 * navy, then the rest on a timeline with their Category and how long ago they were booked.
 * Each opens its page.
 */
export function RecentActivityCard({ recent }: { recent: RecentActivity[] }) {
  const fmt = useFormatter();
  const lit = spotlight(recent);
  const signed = (transaction: RecentActivity) =>
    `${transaction.amountMinor > 0 ? '+' : ''}${fmt.amount(transaction.amountMinor, { currency: transaction.currency })}`;
  const when = (transaction: RecentActivity) =>
    relativeDay(transaction.daysAgo) ?? fmt.date(transaction.bookingDate);
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
      {!lit ? (
        <p className="mt-3 text-sm text-muted">No Transactions yet.</p>
      ) : (
        <>
          <Link
            href={`/transactions/${lit.spotlit.id}`}
            className="mt-3 block rounded-2xl bg-hero-deep p-4 text-on-hero hover:bg-hero"
          >
            <span className="block text-xs text-on-hero/75">
              Largest lately · {when(lit.spotlit)}
            </span>
            <span className="mt-1 block font-display text-3xl tracking-tight tabular-nums">
              {signed(lit.spotlit)}
            </span>
            <span className="mt-1 block truncate text-sm text-on-hero/85">
              {lit.spotlit.name} · {lit.spotlit.category}
            </span>
          </Link>
          {lit.rest.length > 0 && (
            <ol aria-label="Other recent Transactions" className="mt-4 ml-1.5 border-l border-rule">
              {lit.rest.map((transaction) => (
                <li key={transaction.id} className="relative pb-3 pl-4 last:pb-0">
                  <span
                    aria-hidden
                    className="absolute top-2 -left-[5px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-hero-mid"
                  />
                  <Link
                    href={`/transactions/${transaction.id}`}
                    className="-mx-2 block rounded-lg px-2 py-1 hover:bg-sunken"
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {transaction.name}
                      </span>
                      <span
                        className={`text-sm whitespace-nowrap tabular-nums ${transaction.amountMinor > 0 ? 'text-positive' : 'text-negative'}`}
                      >
                        {signed(transaction)}
                      </span>
                    </span>
                    <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted">
                      <span className={`${BADGE_CLASS.neutral} truncate`}>
                        {transaction.category}
                      </span>
                      <span className="whitespace-nowrap">{when(transaction)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
