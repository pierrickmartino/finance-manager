'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { TILE_CLASS } from '@/components/surface';
import { readCard, type CardMark, type WidgetCardData } from '@/lib/reporting/card';
import { FigureLink } from '../figure-link';
import { DotMatrix, HeatmapGrid, MonthBars, NetWorthLine, TickList } from './marks';
import { DonutRing } from './ring';

type Money = (minor: number) => string;

/** The card's mark, as its reading chose it: dots for in and out, bars per period, ticks for parts. */
function CardBody({ mark, money }: { mark: CardMark; money: Money }) {
  switch (mark.type) {
    case 'none':
      return null;
    case 'empty':
      return <p className="text-muted">No data in this date range yet.</p>;
    case 'number':
      return mark.total === null ? (
        <p className="font-display text-5xl text-muted">—</p>
      ) : (
        <Link href={mark.href} className="font-display text-5xl tabular-nums hover:underline">
          {money(mark.total)}
        </Link>
      );
    case 'ticks':
      return <TickList items={mark.items} />;
    case 'ring':
      return <DonutRing data={mark.data} money={money} />;
    case 'grid':
      return <HeatmapGrid data={mark.data} />;
    case 'dots':
      return <DotMatrix months={mark.months} />;
    case 'bars':
      return <MonthBars periods={mark.periods} />;
    case 'netWorthLine':
      return <NetWorthLine points={mark.points} />;
  }
}

interface WidgetCardProps {
  card: WidgetCardData;
  className?: string;
  /** Edit mode's actions on this Widget, at the top of its card. */
  toolbar?: ReactNode;
}

/**
 * One Widget as a card of the Dashboard's grid: its name, a sentence saying what its chart
 * shows, the chart, and the facts behind it (GLOSSARY: Dashboard Story).
 */
export function WidgetCard({ card, className = '', toolbar }: WidgetCardProps) {
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const reading = readCard(card, money);
  return (
    <section
      aria-labelledby={`card-${card.id}`}
      className={`${TILE_CLASS} flex flex-col gap-4 ${className}`}
    >
      {toolbar}
      <div>
        <h2 id={`card-${card.id}`} className="font-medium">
          {card.name}
        </h2>
        {reading.lead && (
          <>
            <p className="mt-1 text-sm text-muted">{reading.lead.headline}</p>
            <p className="font-display text-3xl tracking-tight tabular-nums">
              <FigureLink href={reading.lead.href}>{reading.lead.detail}</FigureLink>
            </p>
          </>
        )}
      </div>
      {card.error && <FieldError message={card.error} />}
      {card.unconvertedCount > 0 && (
        <p className="text-sm text-warning">{card.unconvertedCount} left out: no FX rate yet.</p>
      )}
      <CardBody mark={reading.mark} money={money} />
      {reading.facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 border-t border-rule pt-3">
          {reading.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="text-sm tabular-nums">
                <FigureLink href={fact.href}>{fact.value}</FigureLink>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
