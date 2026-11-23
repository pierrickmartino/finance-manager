import type { ReactNode } from 'react';
import { analyticsHref, type PinnableSection } from '@/lib/analytics/period';
import type { AnalyticsCard, Pinnable } from '@/server/services/analytics';
import { WidgetCard } from '../dashboards/(dashboard)/[id]/overview/widget-card';
import { CardPeriod } from './card-period';
import { SectionCard, SectionEmpty } from './section';

interface CardSectionProps {
  card: Promise<AnalyticsCard>;
  /** Why there is nothing to show, when nothing the section reports falls in the Period. */
  empty: string;
  className?: string;
}

interface LoadedCardProps {
  card: AnalyticsCard;
  empty: string;
  className: string;
  titleAside?: ReactNode;
}

/**
 * A section of Analytics drawn as a Widget's card on the Dashboard Story (GLOSSARY: Card), once
 * its figures arrive: the same headline, chart and facts, each opening its Drill-down back to
 * Analytics. With nothing in the Period, a quiet line says so instead.
 */
export async function CardSection({ card, empty, className = '' }: CardSectionProps) {
  return <LoadedCard card={await card} empty={empty} className={className} />;
}

interface PinnableCardSectionProps {
  card: Promise<Pinnable<AnalyticsCard>>;
  /** The section, by the parameter its pin travels in. */
  section: PinnableSection;
  empty: string;
  className?: string;
}

/**
 * A pinnable section of Analytics drawn as a Card (GLOSSARY: Card Period): a `CardSection` with
 * its Period dropdown beside its title, and its preset marked there when pinned. It is read over
 * the reading its result names.
 */
export async function PinnableCardSection({
  card,
  section,
  empty,
  className = '',
}: PinnableCardSectionProps) {
  const { reading, isPinned, ...loaded } = await card;
  const aside = (
    // Keyed by the page's URL, so back and forward show the pick that URL holds.
    <CardPeriod
      key={analyticsHref(reading.page.period, reading.page.cardPeriods)}
      name={loaded.name}
      section={section}
      page={reading.page}
      pinned={isPinned && reading.period.kind === 'preset' ? reading.period.preset : null}
    />
  );
  return <LoadedCard card={loaded} empty={empty} className={className} titleAside={aside} />;
}

/** A section's loaded Card: a quiet line when nothing falls in its Period, the Card otherwise. */
function LoadedCard({ card: loaded, empty, className, titleAside }: LoadedCardProps) {
  if (loaded.isEmpty) {
    return (
      <SectionCard
        name={loaded.name}
        className={className}
        titleAside={titleAside}
        unconverted={{
          count: loaded.unconvertedCount,
          counted: loaded.source === 'account_balances' ? 'Account' : 'Transaction',
        }}
      >
        <SectionEmpty>{empty}</SectionEmpty>
      </SectionCard>
    );
  }
  return <WidgetCard card={loaded} className={`min-w-0 ${className}`} titleAside={titleAside} />;
}
