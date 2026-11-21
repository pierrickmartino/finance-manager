import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { analyticsHref, parsePeriodView } from '@/lib/analytics/period-view';
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
import { AnalyticsPrototypeSwitcher } from './analytics-prototype-switcher';
import {
  AnalyticsVariantLayout,
  parseVariant,
  VARIANT_COOKIE,
  type AnalyticsSlots,
} from './analytics-variants';
import { CardSection } from './card-section';
import { StreamedCompleteness } from './completeness/streamed-completeness';
import { NET_WORTH, NetWorthSection } from './net-worth';
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
  searchParams: Promise<{ period?: string | string[]; variant?: string | string[] }>;
}) {
  const params = await searchParams;
  const view = parsePeriodView(params.period);
  const variant = parseVariant(
    typeof params.variant === 'string' ? params.variant : undefined,
    (await cookies()).get(VARIANT_COOKIE)?.value,
  );
  const ctx = await getServiceContext();
  const fmt = await getFormatter();
  // Started now, and awaited by the section that shows each (nothing is awaited in between).
  const { sections, today } = loadAnalytics(ctx, view);
  const retryHref = analyticsHref(view);

  // PROTOTYPE: the sections, placed by the layout of the variant in force (./analytics-variants).
  const slots: AnalyticsSlots = {
    completeness: <StreamedCompleteness ctx={ctx} fmt={fmt} today={today} />,
    netWorth: (
      <StreamedSection name={NET_WORTH} retryHref={retryHref}>
        <NetWorthSection netWorth={sections.netWorth} view={view} />
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
    cashFlow: (
      <StreamedSection name={NET_CASH_FLOW} retryHref={retryHref}>
        <CardSection
          card={sections.netCashFlow}
          empty="Nothing to show yet: no Transactions in these periods."
        />
      </StreamedSection>
    ),
    balances: (
      <StreamedSection name={ACCOUNT_BALANCES} retryHref={retryHref}>
        <CardSection card={sections.accountBalances} empty="Nothing to show yet: no Accounts." />
      </StreamedSection>
    ),
    spending: (
      <StreamedSection name={SPENDING_BY_CATEGORY} retryHref={retryHref}>
        <CardSection
          card={sections.spendingByCategory}
          empty="Nothing to show yet: no expense in these periods."
        />
      </StreamedSection>
    ),
    incomeVsExpense: (
      <StreamedSection name={INCOME_VS_EXPENSE} retryHref={retryHref}>
        <CardSection
          card={sections.incomeVsExpense}
          empty="Nothing to show yet: no income, expense or Capital in these periods."
        />
      </StreamedSection>
    ),
    categories: (
      <StreamedSection name={CATEGORIES_PER_PERIOD} retryHref={retryHref}>
        <CardSection
          card={sections.categoriesPerPeriod}
          empty="Nothing to show yet: no classified Transactions in these periods."
        />
      </StreamedSection>
    ),
  };

  return (
    <>
      <AnalyticsVariantLayout variant={variant} view={view} slots={slots} />
      <Suspense>
        <AnalyticsPrototypeSwitcher current={variant} />
      </Suspense>
    </>
  );
}
