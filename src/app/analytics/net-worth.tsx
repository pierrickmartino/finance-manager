import { periodDates } from '@/lib/analytics/period';
import type { AnalyticsNetWorth, AnalyticsReading } from '@/server/services/analytics';
import { NetWorthCard } from '../dashboards/(dashboard)/[id]/overview/overview-row';
import { SectionCard, SectionEmpty } from './section';

export const NET_WORTH = 'Net worth';

/** The change chip's label: Net worth's change over the Period. */
export const PERIOD_CHANGE = 'Period';

interface NetWorthSectionProps {
  netWorth: Promise<AnalyticsNetWorth>;
  reading: AnalyticsReading;
}

/**
 * Analytics' Net worth, once it arrives, drawn as the Dashboard's Net worth card: Net worth
 * today beside a trend from the Period's start through each interval end to today, its change since
 * the Period's start, then what came in, went out and the Profit over the Period.
 */
export async function NetWorthSection({ netWorth, reading }: NetWorthSectionProps) {
  const loaded = await netWorth;
  if (loaded.isEmpty) {
    return (
      <SectionCard
        name={NET_WORTH}
        unconverted={{ count: loaded.unconvertedCount, counted: 'Account' }}
      >
        <SectionEmpty>Nothing to show yet: no Account holds money.</SectionEmpty>
      </SectionCard>
    );
  }
  return (
    <NetWorthCard
      cards={loaded.cards}
      trend={loaded.trend}
      period={reading.grain}
      trendLabel={`Net worth, ${periodDates(reading)}`}
      unconvertedCount={loaded.unconvertedCount}
      changes={
        loaded.change ? [{ label: PERIOD_CHANGE, ...loaded.change, isSinceStart: true }] : []
      }
    />
  );
}
