import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PAGE_TITLE_CLASS } from '@/components/surface';
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
  KEY_FIGURES,
  loadAnalytics,
  NET_CASH_FLOW,
  PROFIT_AND_LOSS,
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

export const metadata: Metadata = { title: 'Analytics · Finance Manager' };

/**
 * Analytics (GLOSSARY, ADR-0016): one fixed page of reports read over the Period in the URL: a
 * preset's `period`, or a custom start date's `from` (Rolling 12 months when missing, unknown or
 * after today); a former Period view's `period` link, or a former Span's `span` link, redirects to
 * its nearest Period. Some Cards may be pinned to their own Card Period (GLOSSARY, ADR-0018), one
 * parameter each beside the Period (`net-worth=<slug>`, `net-cash-flow=<slug>`,
 * `spending-by-category=<slug>`, `profit-and-loss=<slug>`, `income-vs-expense=<slug>`,
 * `categories-per-interval=<slug>`); a bare visit has none, and a former link carries none. The
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

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Analytics</h1>
        <p className="text-muted">Your finances over the Period you choose, up to today.</p>
      </header>
      <StreamedCompleteness ctx={ctx} fmt={fmt} today={today} />
      <PeriodControl
        key={analyticsHref(unpinnedPage(period))}
        period={period}
        from={reading.from}
        phrase={periodPhrase(period, reading)}
        starts={starts}
        today={today}
        cardPeriods={cardPeriods}
      />
      <div className="grid min-w-0 grid-cols-1 gap-5">
        {/* Key figures: four tiles in a row on wide screens, 2×2 below. */}
        <StreamedSection
          name={KEY_FIGURES}
          retryHref={retryHref}
          placeholder={<KeyFiguresPlaceholder />}
        >
          <KeyFiguresSection keyFigures={sections.keyFigures} fmt={fmt} />
        </StreamedSection>
        {/* The overview: three side by side on wide screens, one after the other below. */}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <StreamedSection name={NET_WORTH} retryHref={retryHref}>
            <NetWorthSection netWorth={sections.netWorth} />
          </StreamedSection>
          <StreamedSection name={SPENDING_INSIGHTS} retryHref={retryHref}>
            <SpendingInsightsSection flow={sections.spendingInsights} />
          </StreamedSection>
          <StreamedSection name={RECENT_TRANSACTIONS} retryHref={retryHref}>
            <RecentTransactionsSection recent={sections.recentTransactions} today={today} />
          </StreamedSection>
        </div>
        {/* Net cash flow, Account balances and Spending by Category side by side on wide screens,
            one after the other below. */}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <StreamedSection name={NET_CASH_FLOW} retryHref={retryHref} isCard>
            <CardSection
              card={sections.netCashFlow}
              section="net-cash-flow"
              empty="Nothing to show yet: no Transactions in these intervals."
            />
          </StreamedSection>
          <StreamedSection name={ACCOUNT_BALANCES} retryHref={retryHref} isCard>
            <CardSection
              card={sections.accountBalances}
              empty="Nothing to show yet: no Accounts."
            />
          </StreamedSection>
          <StreamedSection name={SPENDING_BY_CATEGORY} retryHref={retryHref} isCard>
            <CardSection
              card={sections.spendingByCategory}
              section="spending-by-category"
              empty="Nothing to show yet: no expense in these intervals."
            />
          </StreamedSection>
        </div>
        {/* The whole Period's statement, then its intervals. */}
        <StreamedSection name={PROFIT_AND_LOSS} retryHref={retryHref}>
          <ProfitAndLossSection profitAndLoss={sections.profitAndLoss} fmt={fmt} />
        </StreamedSection>
        <StreamedSection name={INCOME_VS_EXPENSE} retryHref={retryHref} isCard>
          <CardSection
            card={sections.incomeVsExpense}
            section="income-vs-expense"
            empty="Nothing to show yet: no income, expense or Capital in these intervals."
          />
        </StreamedSection>
        <StreamedSection name={CATEGORIES_PER_INTERVAL} retryHref={retryHref} isCard>
          <CardSection
            card={sections.categoriesPerInterval}
            section="categories-per-interval"
            empty="Nothing to show yet: no classified Transactions in these intervals."
          />
        </StreamedSection>
      </div>
    </section>
  );
}
