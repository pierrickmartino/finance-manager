import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { PeriodView } from '@/lib/analytics/period-view';
import { barLabel } from '@/lib/reporting/overview';
import type { SpendingInsightBar, SpendingInsights } from '@/server/services/analytics';
import { drillHref } from './links';
import { SectionCard, SectionEmpty } from './section';

export const SPENDING_INSIGHTS = 'Spending Insights';

type Money = (minor: number) => string;

/** A bar's fill: the latest complete period in the accent, the current one dashed and quiet. */
function barClass(bar: SpendingInsightBar): string {
  if (bar.isToDate) return 'border border-dashed border-hero-deep bg-sunken';
  return bar.isLatest ? 'bg-accent' : 'bg-hero-mid/30 hover:bg-hero-mid/50';
}

interface BarsProps {
  bars: SpendingInsightBar[];
  /** Where the average line sits, from 0 to 1; null without an insight. */
  averageShare: number | null;
  view: PeriodView;
  money: Money;
}

/** Every period's spending as a bar, each opening its Drill-down, over the dashed average. */
function SpendingBars({ bars, averageShare, view, money }: BarsProps) {
  return (
    <figure className="flex flex-col">
      <figcaption className="text-xs text-muted">Spent per {view}</figcaption>
      <div className="relative mt-2 flex h-32 items-end gap-1">
        {averageShare !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-soft"
            style={{ bottom: `${averageShare * 100}%` }}
          />
        )}
        {bars.map((bar) => (
          <Link
            key={bar.key}
            href={drillHref(view, bar.drill)}
            aria-label={`${bar.label}${bar.isToDate ? ' to date' : ''}: ${money(bar.expense)}`}
            title={`${bar.label}${bar.isToDate ? ' (to date)' : ''}: ${money(bar.expense)}`}
            className={`flex-1 rounded-t-sm ${barClass(bar)}`}
            style={{ height: `${Math.max(2, bar.share * 100)}%` }}
          />
        ))}
      </div>
      <div aria-hidden className="mt-1.5 flex gap-1 text-[10px] text-muted">
        {bars.map((bar) => (
          <span
            key={bar.key}
            className={`flex-1 truncate text-center ${bar.isLatest ? 'font-medium text-ink' : ''}`}
          >
            {bar.isToDate ? 'to date' : barLabel(bar.label, view)}
          </span>
        ))}
      </div>
    </figure>
  );
}

interface SpendingInsightsSectionProps {
  section: Promise<SpendingInsights>;
  view: PeriodView;
  fmt: Formatter;
  className?: string;
}

/**
 * Analytics' Spending Insights, once its figures arrive: the latest complete period against the
 * average of the ones before it, then every period's bar, the current one "to date".
 */
export async function SpendingInsightsSection({
  section,
  view,
  fmt,
  className,
}: SpendingInsightsSectionProps) {
  const { insight, bars, isEmpty, unconvertedCount } = await section;
  const unconverted = { count: unconvertedCount };
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  if (isEmpty) {
    return (
      <SectionCard name={SPENDING_INSIGHTS} className={className} unconverted={unconverted}>
        <SectionEmpty>Nothing to show yet: no income or expense.</SectionEmpty>
      </SectionCard>
    );
  }
  return (
    <SectionCard name={SPENDING_INSIGHTS} className={className} unconverted={unconverted}>
      {insight ? (
        <div className="flex flex-col gap-2">
          <p className="font-display text-2xl leading-tight tracking-tight">{insight.headline}</p>
          <p className="text-sm text-ink-soft">
            {insight.detail[0]}
            <Link
              href={drillHref(view, insight.change)}
              className="text-accent-ink underline underline-offset-4"
            >
              {insight.detail[1]}
            </Link>
            {insight.detail[2]}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Not enough complete periods yet to compare: the insight needs two.
        </p>
      )}
      <SpendingBars
        bars={bars}
        averageShare={insight?.averageShare ?? null}
        view={view}
        money={money}
      />
      {insight && (
        <p className="text-xs text-muted">
          Average {money(insight.average)} per {view}, the current {view} not counted.
        </p>
      )}
    </SectionCard>
  );
}
