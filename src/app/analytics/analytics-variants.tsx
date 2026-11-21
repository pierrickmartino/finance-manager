/**
 * PROTOTYPE ONLY: four layouts of Analytics, to answer "what should Analytics look like to show
 * more on screen, with smaller titles?" (`/analytics?variant=A…D`). Every variant draws the same
 * streamed sections; only the header, the grid and (through `data-analytics` and the prototype
 * block at the end of globals.css) the cards' density change. Delete with the prototype.
 *
 * - A  Current: today's page (baseline).
 * - B  Tight cards: same arrangement; one toolbar row (title, subtitle, switch); cards with
 *      half the padding and gaps, 13px card titles, 22px headline amounts, shorter charts,
 *      thinner heatmap rows.
 * - C  Four-up wall: B's density, and four cards per row on wide screens; Income vs. expense
 *      beside Account balances and Spending by Category, so the fold holds eight sections.
 * - D  Sheet + side rail: no card chrome; the summaries (Net worth, insight, Recent, Account
 *      balances) stack in a 340px rail beside the wide reports, divided by hairlines.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  analyticsHref,
  PERIOD_VIEW_LABELS,
  PERIOD_VIEWS,
  windowPhrase,
  type PeriodView,
} from '@/lib/analytics/period-view';
import { PAGE_TITLE_CLASS } from '@/components/surface';
import { PeriodSwitch } from './period-switch';

export const ANALYTICS_VARIANTS = [
  { key: 'A', name: 'Current' },
  { key: 'B', name: 'Tight cards' },
  { key: 'C', name: 'Four-up wall' },
  { key: 'D', name: 'Sheet + side rail' },
] as const;
export type AnalyticsVariant = (typeof ANALYTICS_VARIANTS)[number]['key'];
export const VARIANT_COOKIE = 'prototype-analytics-variant';

export function parseVariant(fromUrl?: string, fromCookie?: string): AnalyticsVariant {
  const known = (key?: string): key is AnalyticsVariant =>
    ANALYTICS_VARIANTS.some((variant) => variant.key === key);
  const url = fromUrl?.toUpperCase();
  if (known(url)) return url;
  return known(fromCookie) ? fromCookie : 'A';
}

export interface AnalyticsSlots {
  completeness: ReactNode;
  netWorth: ReactNode;
  insights: ReactNode;
  recent: ReactNode;
  cashFlow: ReactNode;
  balances: ReactNode;
  spending: ReactNode;
  incomeVsExpense: ReactNode;
  categories: ReactNode;
}

/** A compact Period view switch: small segmented links, for the toolbar row. */
function CompactSwitch({ view }: { view: PeriodView }) {
  return (
    <nav
      aria-label="Period view"
      data-testid="period-switch"
      className="flex rounded-lg border border-rule-strong bg-surface p-0.5"
    >
      {PERIOD_VIEWS.map((option) => (
        <Link
          key={option}
          href={analyticsHref(option)}
          aria-current={option === view ? 'page' : undefined}
          className="rounded-md px-3 py-1 text-xs font-medium text-ink-soft hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
        >
          {PERIOD_VIEW_LABELS[option]}
        </Link>
      ))}
    </nav>
  );
}

/** One toolbar row: a small title with its subtitle beside it, the switch at the right; sticky. */
function Toolbar({ view }: { view: PeriodView }) {
  return (
    <header className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-1 bg-paper px-1 py-1.5">
      <h1 className="font-display text-lg leading-tight font-semibold tracking-tight">Analytics</h1>
      <p className="text-xs text-muted">
        Your finances over {windowPhrase(view)}, the current one to date.
      </p>
      <div className="ml-auto">
        <CompactSwitch view={view} />
      </div>
    </header>
  );
}

function VariantA({ view, s }: { view: PeriodView; s: AnalyticsSlots }) {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Analytics</h1>
        <p className="text-muted">
          Your finances over {windowPhrase(view)}, the current one to date.
        </p>
      </header>
      {s.completeness}
      <PeriodSwitch view={view} />
      <div className="grid min-w-0 grid-cols-1 gap-5">
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          {s.netWorth}
          {s.insights}
          {s.recent}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          {s.cashFlow}
          {s.balances}
          {s.spending}
        </div>
        {s.incomeVsExpense}
        {s.categories}
      </div>
    </section>
  );
}

function VariantB({ view, s }: { view: PeriodView; s: AnalyticsSlots }) {
  return (
    <section data-analytics="B" className="flex flex-col gap-3">
      <Toolbar view={view} />
      {s.completeness}
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
        {s.netWorth}
        {s.insights}
        {s.recent}
        {s.cashFlow}
        {s.balances}
        {s.spending}
      </div>
      {s.incomeVsExpense}
      {s.categories}
    </section>
  );
}

function VariantC({ view, s }: { view: PeriodView; s: AnalyticsSlots }) {
  return (
    <section data-analytics="C" className="flex flex-col gap-3">
      <Toolbar view={view} />
      {s.completeness}
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {s.netWorth}
        {s.insights}
        {s.cashFlow}
        {s.recent}
        {s.balances}
        {s.spending}
        <div className="min-w-0 md:col-span-2">{s.incomeVsExpense}</div>
        <div className="min-w-0 md:col-span-2 xl:col-span-4">{s.categories}</div>
      </div>
    </section>
  );
}

function VariantD({ view, s }: { view: PeriodView; s: AnalyticsSlots }) {
  return (
    <section data-analytics="D" className="flex flex-col gap-2">
      <Toolbar view={view} />
      {s.completeness}
      <div className="grid min-w-0 grid-cols-1 overflow-hidden rounded-xl border border-rule bg-surface xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col divide-y divide-rule">
          <div className="grid min-w-0 grid-cols-1 divide-rule md:grid-cols-2 md:divide-x">
            {s.cashFlow}
            {s.spending}
          </div>
          {s.incomeVsExpense}
          {s.categories}
        </div>
        <aside
          aria-label="Summary"
          className="flex min-w-0 flex-col divide-y divide-rule border-rule bg-paper/60 max-xl:border-t xl:border-l"
        >
          {s.netWorth}
          {s.insights}
          {s.recent}
          {s.balances}
        </aside>
      </div>
    </section>
  );
}

export function AnalyticsVariantLayout({
  variant,
  view,
  slots,
}: {
  variant: AnalyticsVariant;
  view: PeriodView;
  slots: AnalyticsSlots;
}) {
  switch (variant) {
    case 'A':
      return <VariantA view={view} s={slots} />;
    case 'B':
      return <VariantB view={view} s={slots} />;
    case 'C':
      return <VariantC view={view} s={slots} />;
    case 'D':
      return <VariantD view={view} s={slots} />;
  }
}
