import { analyticsHref, presetNameInSentence, type PinnableSection } from '@/lib/analytics/period';
import type { AnalyticsCard, Pinnable, SectionReading } from '@/server/services/analytics';
import { WidgetCard } from '../dashboards/(dashboard)/[id]/overview/widget-card';
import { CardPeriod } from './card-period';
import { SectionCard, SectionEmpty } from './section';

interface CardSectionBase {
  /**
   * What is missing when nothing the section reports falls in its Period ("no expense"): the quiet
   * line says it of "these intervals", or of a pinned Card's own Period by name.
   */
  empty: string;
  className?: string;
}

/** A section drawn as a Card: one that can't be pinned, or a pinnable one by its `section`. */
type CardSectionProps = CardSectionBase &
  (
    | { card: Promise<AnalyticsCard>; section?: undefined }
    | {
        card: Promise<Pinnable<AnalyticsCard>>;
        /** The section, by the parameter its pin travels in. */
        section: PinnableSection;
      }
  );

/**
 * A section of Analytics drawn as a Widget's card on the Dashboard Story (GLOSSARY: Card), once
 * its figures arrive: the same headline, chart and facts, each opening its Drill-down back to
 * Analytics. With nothing in the Period, a quiet line says so instead. A pinnable one (GLOSSARY:
 * Card Period) has its Period dropdown beside its title, its preset marked there when pinned, and
 * is read over the reading its result names.
 */
export async function CardSection({ card, section, empty, className = '' }: CardSectionProps) {
  const { reading, isPinned, periodName, ...loaded }: AnalyticsCard & Partial<SectionReading> =
    await card;
  const titleAside = section && reading && (
    <SectionCardPeriod
      name={loaded.name}
      section={section}
      reading={reading}
      isPinned={isPinned === true}
    />
  );
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
        <SectionEmpty>
          Nothing to show yet: {empty}
          {section && ` ${periodName ? presetNameInSentence(periodName) : 'in this Period'}`}.
        </SectionEmpty>
      </SectionCard>
    );
  }
  return (
    <WidgetCard
      card={loaded}
      className={`min-w-0 ${className}`}
      titleAside={titleAside}
      // Income vs. expense reads from its chart alone: no facts, its legend under the Period.
      isCompact={section === 'income-vs-expense'}
    />
  );
}

interface SectionCardPeriodProps extends Pick<SectionReading, 'reading' | 'isPinned'> {
  /** The section's name, which names its dropdown. */
  name: string;
  section: PinnableSection;
}

/**
 * A pinnable section's Card Period beside its title (GLOSSARY: Card Period): its dropdown, and its
 * preset marked when pinned, from the reading its result names. Every pinnable section's header
 * uses it: the Card sections, Net worth and Profit and loss.
 */
export function SectionCardPeriod({ name, section, reading, isPinned }: SectionCardPeriodProps) {
  return (
    // Keyed by the page's URL, so back and forward show the pick that URL holds.
    <CardPeriod
      key={analyticsHref(reading.page)}
      name={name}
      section={section}
      page={reading.page}
      pinned={isPinned && reading.period.kind === 'preset' ? reading.period.preset : null}
      today={reading.to}
    />
  );
}
