'use client';

/** PROTOTYPE ONLY — throwaway (see ./density.prototype.tsx). */
import { useFormatter } from '@/components/formatter-provider';
import { readCard } from '@/lib/reporting/card';
import type { AnalyticsCard } from '@/server/services/analytics';
import { FigureLink } from '../dashboards/(dashboard)/[id]/figure-link';

export function FiguresBandGrid({ cards }: { cards: AnalyticsCard[] }) {
  const fmt = useFormatter();
  const money = (minor: number) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards
        .filter((card) => !card.isEmpty)
        .map((card) => {
          const reading = readCard(card, money);
          return (
            <dl key={card.id} className="flex min-w-0 flex-col gap-1.5 border-l border-rule pl-3">
              <dt className="truncate text-xs font-medium text-ink-soft">{card.name}</dt>
              {reading.lead && (
                <dd className="flex flex-col">
                  <span className="truncate text-xs text-muted">{reading.lead.headline}</span>
                  <FigureLink
                    href={reading.lead.href}
                    className="font-display text-lg tracking-tight tabular-nums"
                  >
                    {reading.lead.detail}
                  </FigureLink>
                </dd>
              )}
              {reading.facts.map((fact) => (
                <dd key={fact.label} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-muted">{fact.label}</span>
                  <FigureLink href={fact.href} className="shrink-0 tabular-nums">
                    {fact.value}
                  </FigureLink>
                </dd>
              ))}
            </dl>
          );
        })}
    </div>
  );
}
