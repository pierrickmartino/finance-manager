import type { Metadata } from 'next';
import { PAGE_TITLE_CLASS } from '@/components/surface';
import { analyticsHref, parsePeriodView, type PeriodView } from '@/lib/analytics/period-view';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { loadAnalytics } from '@/server/services/analytics';
import { INCOME_VS_EXPENSE, IncomeVsExpenseSection } from './income-vs-expense';
import { PeriodSwitch } from './period-switch';
import { StreamedSection } from './section';
import { SPENDING_BY_CATEGORY, SpendingByCategorySection } from './spending-by-category';

export const metadata: Metadata = { title: 'Analytics · Finance Manager' };

const GRAINS: Record<PeriodView, string> = {
  year: 'the last 6 years',
  quarter: 'the last 8 quarters',
  month: 'the last 12 months',
};

/**
 * Analytics (GLOSSARY, ADR-0015): one fixed page of reports read through the Period view in the
 * `period` URL parameter (Month when missing or unknown). The shell and the switch render at
 * once; each section streams in behind its own placeholder and error boundary (./section).
 *
 * Adding a section: its service module (src/server/services/analytics), a component here that
 * awaits its promise and renders a `SectionCard`, and a `StreamedSection` below.
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
  const { sections } = loadAnalytics(ctx, view);
  const retryHref = analyticsHref(view);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className={PAGE_TITLE_CLASS}>Analytics</h1>
        <p className="text-muted">Your finances over {GRAINS[view]}, the current one to date.</p>
      </header>
      <PeriodSwitch view={view} />
      <div className="grid min-w-0 grid-cols-1 gap-5">
        <StreamedSection name={SPENDING_BY_CATEGORY} retryHref={retryHref}>
          <SpendingByCategorySection chart={sections.spendingByCategory} view={view} fmt={fmt} />
        </StreamedSection>
        <StreamedSection name={INCOME_VS_EXPENSE} retryHref={retryHref}>
          <IncomeVsExpenseSection table={sections.incomeVsExpense} view={view} fmt={fmt} />
        </StreamedSection>
      </div>
    </section>
  );
}
