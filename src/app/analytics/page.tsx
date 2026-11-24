import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { redirect } from 'next/navigation';
import { PAGE_TITLE_CLASS } from '@/components/surface';
import { rowsHeight } from '@/lib/reporting/board';
import { cardFrame } from '@/lib/reporting/card';
import {
  analyticsHref,
  cardPeriodsFromParams,
  legacyPeriod,
  periodFromParams,
  periodPhrase,
  unpinnedPage,
} from '@/lib/analytics/period';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { swissToday } from '@/server/services/fx/dates';
import {
  ACCOUNT_BALANCES,
  CATEGORIES_PER_INTERVAL,
  INCOME_VS_EXPENSE,
  INCOME_VS_EXPENSE_WIDGET,
  KEY_FIGURES,
  loadAnalytics,
  NET_CASH_FLOW,
  PROFIT_AND_LOSS,
  PROFIT_PER_INTERVAL,
  SPENDING_BY_CATEGORY,
  SPENDING_INSIGHTS,
} from '@/server/services/analytics';
import { CardSection } from './card-section';
import { StreamedCompleteness } from './completeness/streamed-completeness';
import { KeyFiguresPlaceholder, KeyFiguresSection } from './key-figures';
import { NET_WORTH, NetWorthSection } from './net-worth';
import { ProfitAndLossSection } from './profit-and-loss';
import { RECENT_TRANSACTIONS, RecentTransactionsSection } from './recent-transactions';
import { StreamedSection } from './section';
import { PeriodControl } from './period-control';
import { SpendingInsightsSection } from './spending-insights';
import {
  BandKeyFigures,
  MockupKeyFigures,
  PROTOTYPE_VARIANTS,
  RailKeyFigures,
  VariantA,
  VariantB,
  VariantC,
  type PrototypeVariant,
  type Slots,
} from './prototype-variants';
import { WidgetCardPlaceholder } from '../dashboards/(dashboard)/[id]/overview/card-placeholder';

export const metadata: Metadata = { title: 'Analytics · Finance Manager' };

/** Income vs. expense before its figures arrive: its two areas, as tall as a new chart Card. */
const INCOME_VS_EXPENSE_FRAME = cardFrame(INCOME_VS_EXPENSE_WIDGET);

/**
 * Analytics (GLOSSARY, ADR-0016): one fixed page of reports read over the Period in the URL: a
 * preset's `period`, or a custom start date's `from` (Rolling 12 months when missing, unknown or
 * after today); a former Period view's `period` link, or a former Span's `span` link, redirects to
 * its nearest Period. Some Cards may be pinned to their own Card Period (GLOSSARY, ADR-0018), one
 * parameter each beside the Period (`net-worth=<slug>`, `income-vs-expense=<slug>`,
 * `spending-by-category=<slug>`, `profit-and-loss=<slug>`, `net-cash-flow=<slug>`,
 * `profit-per-interval=<slug>`, `categories-per-interval=<slug>`); a bare visit has none, and a former link carries none. The
 * shell and the Period control render at once; each section streams in behind its own placeholder and error boundary
 * (./section), and is drawn by the Dashboard's own cards (GLOSSARY: Card).
 *
 * Adding a section: its service module (src/server/services/analytics), and a `StreamedSection`
 * below drawing it (a `CardSection` for one drawn as a Widget's card).
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string | string[];
    from?: string | string[];
    span?: string | string[];
    [section: string]: string | string[] | undefined;
  }>;
}) {
  const params = await searchParams;
  const legacy = legacyPeriod(params);
  if (legacy) redirect(analyticsHref(unpinnedPage(legacy)));
  const ctx = await getServiceContext();
  const fmt = await getFormatter();
  // Started now, and awaited by the section that shows each (nothing is awaited in between).
  const cardPeriods = cardPeriodsFromParams(params);
  const { sections, today, reading, starts } = await loadAnalytics(
    ctx,
    periodFromParams(params, swissToday()),
    cardPeriods,
  );
  // The effective Period: no Period starts before the first Transaction (a custom date moves to it,
  // a preset keeps its name), and the control shows the start it is read from.
  const { period } = reading;
  const retryHref = analyticsHref(reading.page);

  // PROTOTYPE (?variant=, throwaway): every arrangement draws these same streamed sections.
  const rawVariant = typeof params.variant === 'string' ? params.variant : undefined;
  const variant: PrototypeVariant =
    process.env.NODE_ENV === 'production'
      ? 'current'
      : (PROTOTYPE_VARIANTS.find((v) => v.key === rawVariant)?.key ?? 'A');
  const figures =
    variant === 'A' ? (
      <MockupKeyFigures keyFigures={sections.keyFigures} fmt={fmt} />
    ) : variant === 'B' ? (
      <RailKeyFigures keyFigures={sections.keyFigures} fmt={fmt} />
    ) : variant === 'C' ? (
      <BandKeyFigures keyFigures={sections.keyFigures} fmt={fmt} />
    ) : (
      <KeyFiguresSection keyFigures={sections.keyFigures} fmt={fmt} />
    );
  const s: Slots = {
    completeness: <StreamedCompleteness ctx={ctx} fmt={fmt} today={today} />,
    period: (
      <PeriodControl
        key={analyticsHref(unpinnedPage(period))}
        period={period}
        from={reading.from}
        phrase={periodPhrase(period, reading)}
        starts={starts}
        today={today}
        cardPeriods={cardPeriods}
        variant={variant === 'A' ? undefined : variant}
      />
    ),
    keyFigures: (
      <StreamedSection
        name={KEY_FIGURES}
        retryHref={retryHref}
        placeholder={<KeyFiguresPlaceholder />}
      >
        {figures}
      </StreamedSection>
    ),
    netWorth: (
      <StreamedSection name={NET_WORTH} retryHref={retryHref}>
        <NetWorthSection netWorth={sections.netWorth} />
      </StreamedSection>
    ),
    insights: (
      <StreamedSection name={SPENDING_INSIGHTS} retryHref={retryHref}>
        <SpendingInsightsSection flow={sections.spendingInsights} />
      </StreamedSection>
    ),
    recent: (
      <StreamedSection name={RECENT_TRANSACTIONS} retryHref={retryHref}>
        <RecentTransactionsSection recent={sections.recentTransactions} today={today} />
      </StreamedSection>
    ),
    incomeVsExpense: (
      <StreamedSection
        name={INCOME_VS_EXPENSE}
        retryHref={retryHref}
        isCard
        placeholder={
          <WidgetCardPlaceholder
            name={INCOME_VS_EXPENSE}
            shape={INCOME_VS_EXPENSE_FRAME.placeholder}
            height={rowsHeight(INCOME_VS_EXPENSE_FRAME.sizes.initial.h)}
          />
        }
      >
        <CardSection
          card={sections.incomeVsExpense}
          section="income-vs-expense"
          empty="no income or expense"
        />
      </StreamedSection>
    ),
    accountBalances: (
      <StreamedSection name={ACCOUNT_BALANCES} retryHref={retryHref} isCard>
        <CardSection card={sections.accountBalances} empty="no Accounts" />
      </StreamedSection>
    ),
    spendingByCategory: (
      <StreamedSection name={SPENDING_BY_CATEGORY} retryHref={retryHref} isCard>
        <CardSection
          card={sections.spendingByCategory}
          section="spending-by-category"
          empty="no expense"
        />
      </StreamedSection>
    ),
    profitAndLoss: (
      <StreamedSection name={PROFIT_AND_LOSS} retryHref={retryHref}>
        <ProfitAndLossSection profitAndLoss={sections.profitAndLoss} fmt={fmt} />
      </StreamedSection>
    ),
    netCashFlow: (
      <StreamedSection name={NET_CASH_FLOW} retryHref={retryHref} isCard>
        <CardSection card={sections.netCashFlow} section="net-cash-flow" empty="no Transactions" />
      </StreamedSection>
    ),
    profitPerInterval: (
      <StreamedSection name={PROFIT_PER_INTERVAL} retryHref={retryHref} isCard>
        <CardSection
          card={sections.profitPerInterval}
          section="profit-per-interval"
          empty="no income, expense or Capital"
        />
      </StreamedSection>
    ),
    categoriesPerInterval: (
      <StreamedSection name={CATEGORIES_PER_INTERVAL} retryHref={retryHref} isCard>
        <CardSection
          card={sections.categoriesPerInterval}
          section="categories-per-interval"
          empty="no classified Transactions"
        />
      </StreamedSection>
    ),
  };
  const switcher =
    process.env.NODE_ENV === 'production' ? null : (
      <Suspense>
        <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} current={variant} />
      </Suspense>
    );
  if (variant !== 'current') {
    const Variant = { A: VariantA, B: VariantB, C: VariantC }[variant];
    return (
      <>
        <Variant s={s} />
        {switcher}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Analytics</h1>
        <p className="text-muted">Your finances over the Period you choose, up to today.</p>
      </header>
      {s.completeness}
      {s.period}
      <div className="grid min-w-0 grid-cols-1 gap-5">
        {s.keyFigures}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          {s.netWorth}
          {s.insights}
          {s.recent}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          {s.incomeVsExpense}
          {s.accountBalances}
          {s.spendingByCategory}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="grid min-w-0 lg:col-span-2">{s.profitAndLoss}</div>
          {s.netCashFlow}
        </div>
        {s.profitPerInterval}
        {s.categoriesPerInterval}
      </div>
      {switcher}
    </section>
  );
}
