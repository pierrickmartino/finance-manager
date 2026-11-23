'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { WIDGET_CARD_CLASS } from '@/components/surface';
import { readCard, type CardMark, type WidgetCardData } from '@/lib/reporting/card';
import { FigureLink } from '../figure-link';
import { HeatmapGrid } from './heatmap-grid';
import { DotMatrix, EmptyChart, MonthBars, TickList } from './marks';
import { NetWorthLine } from './net-worth-mark';
import { DonutRing } from './ring';

type Money = (minor: number) => string;

/** The card's mark, as its reading chose it: dots for in and out, bars per period, ticks for parts. */
function CardBody({ mark, money }: { mark: CardMark; money: Money }) {
  switch (mark.type) {
    case 'none':
      return null;
    case 'empty':
      return <p className="text-muted">{mark.sentence}</p>;
    case 'emptyChart':
      return <EmptyChart sentence={mark.sentence} />;
    case 'number':
      return mark.total === null ? (
        <p className="font-display text-3xl text-muted">—</p>
      ) : (
        <Link href={mark.href} className="font-display text-3xl tabular-nums hover:underline">
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
      return <NetWorthLine points={mark.points} bands={mark.bands} markers={mark.markers} />;
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
      className={`${WIDGET_CARD_CLASS} flex flex-col gap-4 ${className}`}
    >
      {toolbar}
      <div>
        <h2 id={`card-${card.id}`} className="font-medium">
          {card.name}
        </h2>
        {reading.lead && (
          <>
            <p className="mt-1 text-sm text-muted">{reading.lead.headline}</p>
            {/* A size down on a narrow Card (Analytics' thirds, small board cells), full from @md. */}
            <p className="font-display text-xl tracking-tight tabular-nums @md:text-3xl">
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
