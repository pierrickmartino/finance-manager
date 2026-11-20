import type { AnalyticsCard } from '@/server/services/analytics';
import { WidgetCard } from '../dashboards/(dashboard)/[id]/overview/widget-card';
import { SectionCard, SectionEmpty } from './section';

interface CardSectionProps {
  card: Promise<AnalyticsCard>;
  /** Why there is nothing to show, when nothing the section reports falls in the window. */
  empty: string;
  className?: string;
}

/**
 * A section of Analytics drawn as a Widget's card on the Dashboard Story (GLOSSARY: Card), once
 * its figures arrive: the same headline, chart and facts, each opening its Drill-down back to
 * Analytics. With nothing in the window, a quiet line says so instead.
 */
export async function CardSection({ card, empty, className = '' }: CardSectionProps) {
  const loaded = await card;
  if (loaded.isEmpty) {
    return (
      <SectionCard
        name={loaded.name}
        className={className}
        unconverted={{
          count: loaded.unconvertedCount,
          of: loaded.source === 'account_balances' ? 'Account' : 'Transaction',
        }}
      >
        <SectionEmpty>{empty}</SectionEmpty>
      </SectionCard>
    );
  }
  return <WidgetCard card={loaded} className={`min-w-0 ${className}`} />;
}
