import { windowPhrase, type PeriodView } from '@/lib/analytics/period-view';
import type { AnalyticsNetWorth } from '@/server/services/analytics';
import { NetWorthCard } from '../dashboards/(dashboard)/[id]/overview/overview-row';
import { SectionCard, SectionEmpty } from './section';

export const NET_WORTH = 'Net worth';

interface NetWorthSectionProps {
  netWorth: Promise<AnalyticsNetWorth>;
  view: PeriodView;
}

/**
 * Analytics' Net worth, once it arrives, drawn as the Dashboard's Net worth card: Net worth
 * today beside a trend with a point per period end of the window and today, its change since the
 * end of the previous period, then what came in, went out and the Profit over the window.
 */
export async function NetWorthSection({ netWorth, view }: NetWorthSectionProps) {
  const loaded = await netWorth;
  if (loaded.isEmpty) {
    return (
      <SectionCard name={NET_WORTH} unconverted={{ count: loaded.unconvertedCount, of: 'Account' }}>
        <SectionEmpty>Nothing to show yet: no Account holds money.</SectionEmpty>
      </SectionCard>
    );
  }
  return (
    <NetWorthCard
      cards={loaded.cards}
      trend={loaded.trend}
      period={view}
      trendLabel={`Net worth over ${windowPhrase(view)}`}
      unconvertedCount={loaded.unconvertedCount}
    />
  );
}
