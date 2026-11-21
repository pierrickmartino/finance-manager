import type { Metadata } from 'next';
import { PAGE_TITLE_CLASS } from '@/components/surface';
import { analyticsHref, parsePeriodView, windowPhrase } from '@/lib/analytics/period-view';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import {
  ACCOUNT_BALANCES,
  CATEGORIES_PER_PERIOD,
  INCOME_VS_EXPENSE,
  loadAnalytics,
  NET_CASH_FLOW,
  SPENDING_BY_CATEGORY,
  SPENDING_INSIGHTS,
} from '@/server/services/analytics';
import { CardSection } from './card-section';
import { StreamedCompleteness } from './completeness/streamed-completeness';
import { NET_WORTH, NetWorthSection } from './net-worth';
import { PeriodSwitch } from './period-switch';
import { RECENT_TRANSACTIONS, RecentTransactionsSection } from './recent-transactions';
import { StreamedSection } from './section';
import { SpendingInsightsSection } from './spending-insights';

export const metadata: Metadata = { title: 'Analytics · Finance Manager' };

/**
 * Analytics (GLOSSARY, ADR-0015): one fixed page of reports read through the Period view in the
 * `period` URL parameter (Month when missing or unknown). The shell and the switch render at
 * once; each section streams in behind its own placeholder and error boundary (./section), and
 * is drawn by the Dashboard's own cards (GLOSSARY: Card).
 *
 * Adding a section: its service module (src/server/services/analytics), and a `StreamedSection`
 * below drawing it (a `CardSection` for one drawn as a Widget's card).
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const view = parsePeriodView((await searchParams).period);
  const ctx = await getServiceContext();
  const fmt = await getFormatter();
  // Started now, and awaited by the section that shows each (nothing is awaited in between).
  const { sections, today } = loadAnalytics(ctx, view);
  const retryHref = analyticsHref(view);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Analytics</h1>
        <p className="text-muted">
          Your finances over {windowPhrase(view)}, the current one to date.
        </p>
      </header>
      <StreamedCompleteness ctx={ctx} fmt={fmt} today={today} />
      <PeriodSwitch view={view} />
      <div className="grid min-w-0 grid-cols-1 gap-5">
        {/* The overview: three side by side on wide screens, one after the other below. */}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <StreamedSection name={NET_WORTH} retryHref={retryHref}>
            <NetWorthSection netWorth={sections.netWorth} view={view} />
          </StreamedSection>
          <StreamedSection name={SPENDING_INSIGHTS} retryHref={retryHref}>
            <SpendingInsightsSection flow={sections.spendingInsights} />
          </StreamedSection>
          <StreamedSection name={RECENT_TRANSACTIONS} retryHref={retryHref}>
            <RecentTransactionsSection recent={sections.recentTransactions} today={today} />
          </StreamedSection>
        </div>
        {/* Three columns on wide screens, one after the other below: Net cash flow over Income
            vs expense (the pair together as tall as the row, each growing to share it), then
            Account balances and Spending by Category. */}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-5">
            <StreamedSection name={NET_CASH_FLOW} retryHref={retryHref} className="flex-1">
              <CardSection
                card={sections.netCashFlow}
                empty="Nothing to show yet: no Transactions in these periods."
                className="flex-1"
              />
            </StreamedSection>
            <StreamedSection name={INCOME_VS_EXPENSE} retryHref={retryHref} className="flex-1">
              <CardSection
                card={sections.incomeVsExpense}
                empty="Nothing to show yet: no income, expense or Capital in these periods."
                className="flex-1"
              />
            </StreamedSection>
          </div>
          <StreamedSection name={ACCOUNT_BALANCES} retryHref={retryHref}>
            <CardSection
              card={sections.accountBalances}
              empty="Nothing to show yet: no Accounts."
            />
          </StreamedSection>
          <StreamedSection name={SPENDING_BY_CATEGORY} retryHref={retryHref}>
            <CardSection
              card={sections.spendingByCategory}
              empty="Nothing to show yet: no expense in these periods."
            />
          </StreamedSection>
        </div>
        <StreamedSection name={CATEGORIES_PER_PERIOD} retryHref={retryHref}>
          <CardSection
            card={sections.categoriesPerPeriod}
            empty="Nothing to show yet: no classified Transactions in these periods."
          />
        </StreamedSection>
      </div>
    </section>
  );
}
