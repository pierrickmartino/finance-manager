import type { Metadata } from 'next';
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
import { KeyFiguresPlaceholder, KeyFiguresSection } from './key-figures';
import { ProfitAndLossSection } from './profit-and-loss';
import { RECENT_TRANSACTIONS, RecentTransactionsSection } from './recent-transactions';
import { StreamedSection } from './section';
import { PeriodControl } from './period-control';
import { SpendingInsightsSection } from './spending-insights';
import { WidgetCardPlaceholder } from '../dashboards/(dashboard)/[id]/overview/card-placeholder';

export const metadata: Metadata = { title: 'Analytics · Finance Manager' };

/** Income vs. expense before its figures arrive: its two areas, as tall as a new chart Card. */
const INCOME_VS_EXPENSE_FRAME = cardFrame(INCOME_VS_EXPENSE_WIDGET);

/**
 * Analytics (GLOSSARY, ADR-0016, ADR-0021): one fixed page of reports read over the Period preset
 * in the URL's `period` (Last 12 months when missing or unknown); a former Period view's `period`
 * link, a former Span's `span` link, or a former custom start date's `from` link, redirects to its
 * nearest Period, keeping any pins. Some Cards may be pinned to their own Card Period (GLOSSARY, ADR-0018), one
 * parameter each beside the Period (`income-vs-expense=<slug>`,
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
  const cardPeriods = cardPeriodsFromParams(params);
  if (legacy) redirect(analyticsHref({ period: legacy, cardPeriods }));
  const ctx = await getServiceContext();
  const fmt = await getFormatter();
  const chosen = periodFromParams(params);
  // Started now, and awaited by the section that shows each (nothing is awaited in between).
  const { sections, today, reading } = await loadAnalytics(ctx, chosen, cardPeriods);
  // The Period is read from no earlier than the first Transaction; the phrase gives those dates.
  const { period } = reading;
  const retryHref = analyticsHref(reading.page);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Analytics</h1>
        <p className="text-muted">Your finances over the Period you choose, up to today.</p>
      </header>
      <PeriodControl
        key={analyticsHref(unpinnedPage(period))}
        preset={chosen.preset}
        phrase={periodPhrase(period, reading)}
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
        {/* The overview: side by side on wide screens, one after the other below. */}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
          <StreamedSection name={SPENDING_INSIGHTS} retryHref={retryHref}>
            <SpendingInsightsSection flow={sections.spendingInsights} />
          </StreamedSection>
          <StreamedSection name={RECENT_TRANSACTIONS} retryHref={retryHref}>
            <RecentTransactionsSection recent={sections.recentTransactions} today={today} />
          </StreamedSection>
        </div>
        {/* Income vs. expense, Account balances and Spending by Category side by side on wide
            screens, one after the other below. */}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
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
          <StreamedSection name={ACCOUNT_BALANCES} retryHref={retryHref} isCard>
            <CardSection card={sections.accountBalances} empty="no Accounts" />
          </StreamedSection>
          <StreamedSection name={SPENDING_BY_CATEGORY} retryHref={retryHref} isCard>
            <CardSection
              card={sections.spendingByCategory}
              section="spending-by-category"
              empty="no expense"
            />
          </StreamedSection>
        </div>
        {/* The whole Period's statement beside its Net cash flow on wide screens, then its
            intervals. */}
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="grid min-w-0 lg:col-span-2">
            <StreamedSection name={PROFIT_AND_LOSS} retryHref={retryHref}>
              <ProfitAndLossSection profitAndLoss={sections.profitAndLoss} fmt={fmt} />
            </StreamedSection>
          </div>
          <StreamedSection name={NET_CASH_FLOW} retryHref={retryHref} isCard>
            <CardSection
              card={sections.netCashFlow}
              section="net-cash-flow"
              empty="no Transactions"
            />
          </StreamedSection>
        </div>
        <StreamedSection name={PROFIT_PER_INTERVAL} retryHref={retryHref} isCard>
          <CardSection
            card={sections.profitPerInterval}
            section="profit-per-interval"
            empty="no income, expense or Capital"
          />
        </StreamedSection>
        <StreamedSection name={CATEGORIES_PER_INTERVAL} retryHref={retryHref} isCard>
          <CardSection
            card={sections.categoriesPerInterval}
            section="categories-per-interval"
            empty="no classified Transactions"
          />
        </StreamedSection>
      </div>
    </section>
  );
}
