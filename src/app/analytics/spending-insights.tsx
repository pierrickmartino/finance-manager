import { readCard } from '@/lib/reporting/card';
import { spendingInsight } from '@/lib/reporting/overview';
import { SPENDING_INSIGHTS, type AnalyticsCard } from '@/server/services/analytics';
import { InsightCard } from '../dashboards/(dashboard)/[id]/overview/overview-row';
import { SectionCard, SectionEmpty } from './section';

/**
 * Analytics' Spending Insights, once its figures arrive, drawn as the Dashboard's insight card:
 * the last complete month's spending against the months before it, whatever the Span
 * (ADR-0016), each complete month's bar, and its Transactions. Without two complete months to
 * compare, a quiet line says why instead.
 */
export async function SpendingInsightsSection({ flow }: { flow: Promise<AnalyticsCard> }) {
  const card = await flow;
  // The insight card tells nothing without one; say why here, as the card would draw nothing.
  const { flow: months } = readCard(card, String);
  const hasInsight = months !== null && spendingInsight(months.months, months.period) !== null;
  if (!hasInsight) {
    return (
      <SectionCard name={SPENDING_INSIGHTS} unconverted={{ count: card.unconvertedCount }}>
        <SectionEmpty>
          {card.isEmpty
            ? 'Nothing to show yet: no income or expense.'
            : 'Not enough complete months yet to compare: the insight needs two.'}
        </SectionEmpty>
      </SectionCard>
    );
  }
  return <InsightCard cards={[card]} unconvertedCount={card.unconvertedCount} />;
}
