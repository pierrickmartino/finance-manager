'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { BADGE_CLASS, HEADLINE_AMOUNT_CLASS, TILE_CLASS } from '@/components/surface';
import { readCard, type CardFlow, type MonthFlow, type WidgetCardData } from '@/lib/reporting/card';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { plural } from '@/lib/reporting/drill-summary';
import { readHeadlineTrend } from '@/lib/reporting/net-worth-headline';
import type { TimeAxis } from '@/server/services/reporting/query';
import {
  barLabel,
  flowSummary,
  headlineAmount,
  periodCount,
  spendingBars,
  spendingInsight,
  type FlowSummary,
} from '@/lib/reporting/overview';
import { relativeDay, spotlight } from '@/lib/reporting/recent-activity';
import { FigureLink } from '../figure-link';
import { ChangeChips, NetWorthSparkline } from './headline-trend';

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
function overviewFlow(cards: WidgetCardData[], money: Money): CardFlow | null {
  for (const card of cards) {
    const { flow } = readCard(card, money);
    if (flow) return flow;
  }
  return null;
}

interface StatProps {
  label: string;
  value: string;
  /** The bar's length, as a share of the larger of income and expense. */
  share: number;
  tone: string;
}

/** One total with a bar drawn against the larger of what came in and what went out. */
function Stat({ label, value, share, tone }: StatProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-sunken" aria-hidden>
        <div
          className={`h-2 rounded-full ${tone}`}
          style={{ width: `${Math.max(2, Math.min(1, share) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-paper p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 tabular-nums">{children}</dd>
    </div>
  );
}

const shortMonth = (label: string): string => label.split(' ')[0] ?? label;

interface FlowBreakdownProps {
  summary: FlowSummary;
  /** The period of the Widget's rows, which the labels name. */
  period: TimeAxis;
  money: Money;
}

/** What came in, went out and the Profit, then the Profit per period, margin, best and leanest. */
function FlowBreakdown({ summary, period, money }: FlowBreakdownProps) {
  const { income, expense, profit, profitMargin, profitPerPeriod, best, leanest } = summary;
  const top = Math.max(1, income, expense);
  return (
    <>
      <div className="mt-6 flex flex-col gap-4">
        <Stat label="Came in" value={money(income)} share={income / top} tone="bg-hero-deep" />
        <Stat label="Went out" value={money(expense)} share={expense / top} tone="bg-hero-glow" />
        <Stat
          label="Profit"
          value={money(profit)}
          share={Math.abs(profit) / top}
          tone={profit >= 0 ? 'bg-positive' : 'bg-negative'}
        />
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-3 pt-6 text-sm">
        {profitPerPeriod !== null && (
          <Fact label={`Profit per ${period}`}>
            <span className="font-display text-xl">{money(Math.round(profitPerPeriod))}</span>
          </Fact>
        )}
        {profitMargin !== null && (
          <Fact label="Profit margin">
            <span className="font-display text-xl">{Math.round(profitMargin * 100)}%</span>
          </Fact>
        )}
        {best && (
          <Fact label={`Best ${period}`}>
            {shortMonth(best.label)} ·{' '}
            <span className={best.net < 0 ? 'text-negative' : 'text-positive'}>
              {money(best.net)}
            </span>
          </Fact>
        )}
        {leanest && (
          <Fact label={`Leanest ${period}`}>
            {shortMonth(leanest.label)} ·{' '}
            <span className={leanest.net < 0 ? 'text-negative' : ''}>{money(leanest.net)}</span>
          </Fact>
        )}
      </dl>
    </>
  );
}

/** What a card's figures leave out for want of an FX rate, when anything: as a Widget's card says. */
function Unconverted({ count, of, className }: { count: number; of: string; className: string }) {
  if (count <= 0) return null;
  return <p className={`text-sm ${className}`}>{plural(count, of)} left out: no FX rate yet.</p>;
}

interface NetWorthCardProps {
  cards: WidgetCardData[];
  /** Every Account's Net worth by period: today and the period ends before; null when not loaded. */
  trend: ChartSource | null;
  /** The period of the trend's points, which its change chips count in; months by default. */
  period?: TimeAxis;
  /** What the trend spans, for assistive technology; the last 24 months by default. */
  trendLabel?: string;
  /** Accounts left out of the trend for want of an FX rate. */
  unconvertedCount?: number;
}

/**
 * The opening number (net worth, else the first Widget's total), beside net worth a sparkline of
 * its last 24 months and under it its change over 1M, 1Y and 2Y, and, from an income-vs-expense
 * Widget, what came in, went out and the Profit over its periods. With that breakdown it stands as tall as Recent activity (both span the overview
 * row's two rows from `lg` up).
 */
export function NetWorthCard({
  cards,
  trend,
  period = 'month',
  trendLabel,
  unconvertedCount = 0,
}: NetWorthCardProps) {
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const hero = headlineAmount(cards, trend && readHeadlineTrend(trend, period));
  if (!hero) return null;
  const flow = overviewFlow(cards, money);
  const summary = flow ? flowSummary(flow.months) : null;
  return (
    <section
      aria-labelledby="overview-headline"
      className={`${TILE_CLASS} flex flex-col bg-gradient-to-br from-hero-mist/30 to-surface ${flow ? 'lg:row-span-2 lg:self-stretch' : ''}`}
    >
      <h2 id="overview-headline" className="font-medium">
        {hero.label}
      </h2>
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <Link href={hero.href} className={`${HEADLINE_AMOUNT_CLASS} shrink-0 hover:underline`}>
          {money(hero.value)}
        </Link>
        {hero.trend && (
          <NetWorthSparkline points={hero.trend.points} money={money} label={trendLabel} />
        )}
      </div>
      {hero.trend && <ChangeChips changes={hero.trend.changes} />}
      <Unconverted count={unconvertedCount} of="Account" className="mt-2 text-warning" />
      {flow && summary && (
        <>
          <p className="mt-2 text-sm text-muted">
            <FigureLink
              href={flow.href}
              className={summary.profit >= 0 ? 'text-positive' : 'text-negative'}
            >
              <span aria-hidden>{summary.profit >= 0 ? '↗' : '↘'}</span> {money(summary.profit)}
            </FigureLink>{' '}
            profit over {periodCount(flow.months.length, flow.period)}
          </p>
          <FlowBreakdown summary={summary} period={flow.period} money={money} />
        </>
      )}
    </section>
  );
}

interface SpendingChartProps {
  months: MonthFlow[];
  /** The period of the Widget's rows, which the caption names. */
  period: TimeAxis;
  money: Money;
}

/**
 * Each full period's spending as a bar against the dashed average line, the latest lit. It fills
 * the card's height from `lg` up; below, the card has no set height, so the bars get one.
 */
function SpendingChart({ months, period, money }: SpendingChartProps) {
  const chart = spendingBars(months);
  if (!chart) return null;
  const { bars, average, averageShare } = chart;
  const caption = `Spent per ${period}`;
  const label = `${caption}: ${bars.map((bar) => `${bar.label} ${money(bar.expense)}`).join(', ')}. Average ${money(Math.round(average))}.`;
  return (
    <figure className="mt-6 flex min-h-40 flex-1 flex-col">
      <figcaption className="flex items-baseline justify-between text-xs text-on-hero/70">
        <span>{caption}</span>
        <span>
          Average <span className="tabular-nums">{money(Math.round(average))}</span>
        </span>
      </figcaption>
      <div
        role="img"
        aria-label={label}
        className="relative mt-2 flex h-32 items-end gap-1.5 lg:h-auto lg:flex-1"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 border-t border-dashed border-on-hero/50"
          style={{ bottom: `${averageShare * 100}%` }}
        />
        {bars.map((bar) => (
          <div
            key={bar.label}
            title={`${bar.label}: ${money(bar.expense)}`}
            className={`flex-1 rounded-t-md ${bar.isLatest ? 'bg-on-hero' : 'bg-on-hero/25'}`}
            style={{ height: `${Math.max(2, bar.share * 100)}%` }}
          />
        ))}
      </div>
      <div aria-hidden className="mt-1.5 flex gap-1.5 text-[10px] text-on-hero/60">
        {bars.map((bar) => (
          <span
            key={bar.label}
            className={`flex-1 truncate text-center ${bar.isLatest ? 'font-medium text-on-hero' : ''}`}
          >
            {barLabel(bar.label, period)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/**
 * How the latest full month compares, in the hero's navy: one sentence, then each full month's
 * spending against the average. As tall as Recent activity (both span the overview row's two
 * rows from `lg` up).
 */
export function InsightCard({
  cards,
  unconvertedCount = 0,
}: {
  cards: WidgetCardData[];
  /** Transactions left out of its figures for want of an FX rate. */
  unconvertedCount?: number;
}) {
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const flow = overviewFlow(cards, (minor) => fmt.amount(minor, { currency: 'CHF' }));
  const insight = flow ? spendingInsight(flow.months, flow.period) : null;
  if (!flow || !insight) return null;
  const [before, change, after] = insight.detail;
  return (
    <section
      aria-labelledby="overview-insight"
      className="flex flex-col rounded-3xl bg-insight p-6 text-on-hero shadow-lg lg:row-span-2 lg:self-stretch"
    >
      <h2 id="overview-insight" className="font-display text-lg leading-snug tracking-tight">
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
      <Unconverted count={unconvertedCount} of="Transaction" className="mt-2 text-on-hero/80" />
      <SpendingChart months={flow.months} period={flow.period} money={money} />
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
export function RecentActivityCard({
  recent,
  title = 'Recent activity',
}: {
  recent: RecentActivity[];
  /** The card's name: Analytics calls it Recent transactions. */
  title?: string;
}) {
  return (
    <section aria-labelledby="overview-recent" className={`${TILE_CLASS} lg:row-span-2`}>
      <div className="flex items-center justify-between">
        <h2 id="overview-recent" className="font-medium">
          {title}
        </h2>
        <Link href="/transactions" className="text-sm text-muted hover:text-ink">
          View all
        </Link>
      </div>
      <RecentActivityList recent={recent} />
    </section>
  );
}

/**
 * The body of Recent activity: the spotlight and the timeline, or a line saying there are no
 * Transactions yet.
 */
function RecentActivityList({ recent }: { recent: RecentActivity[] }) {
  const fmt = useFormatter();
  const lit = spotlight(recent);
  const signed = (transaction: RecentActivity) =>
    `${transaction.amountMinor > 0 ? '+' : ''}${fmt.amount(transaction.amountMinor, { currency: transaction.currency })}`;
  const when = (transaction: RecentActivity) =>
    relativeDay(transaction.daysAgo) ?? fmt.date(transaction.bookingDate);
  return !lit ? (
    <p className="mt-3 text-sm text-muted">No Transactions yet.</p>
  ) : (
    <>
      <Link
        href={`/transactions/${lit.spotlit.id}`}
        className="mt-3 block rounded-2xl bg-hero-deep p-4 text-on-hero hover:bg-hero"
      >
        <span className="block text-xs text-on-hero/75">Largest lately · {when(lit.spotlit)}</span>
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
                  <span className={`${BADGE_CLASS.neutral} truncate`}>{transaction.category}</span>
                  <span className="whitespace-nowrap">{when(transaction)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
