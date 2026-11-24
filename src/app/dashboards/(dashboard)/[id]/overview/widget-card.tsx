'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { WIDGET_CARD_CLASS } from '@/components/surface';
import { TitleRow } from '@/components/title-row';
import { readCard, type CardMark, type WidgetCardData } from '@/lib/reporting/card';
import { FigureLink } from '../figure-link';
import { CARD_LEAD_SIZE_CLASS } from './card-layout';
import { FlowAreas, FlowSwatches } from './flow-areas';
import { HeatmapGrid } from './heatmap-grid';
import { DotMatrix, EmptyChart, MonthBars, TickList } from './marks';
import { NetWorthLine } from './net-worth-mark';
import { DonutRing } from './ring';

type Money = (minor: number) => string;

/**
 * The card's mark, as its reading chose it: dots or two areas for in and out, bars per period,
 * ticks for parts.
 */
function CardBody({
  mark,
  money,
  hasLegendInHeader,
}: {
  mark: CardMark;
  money: Money;
  hasLegendInHeader: boolean;
}) {
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
    case 'areas':
      return (
        <FlowAreas
          points={mark.points}
          isRunning={mark.isRunning}
          hasLegendElsewhere={hasLegendInHeader}
        />
      );
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
  /** Drawn beside the card's title: an Analytics Card's Period mark and dropdown. */
  titleAside?: ReactNode;
  /**
   * A compact chart card (Analytics' Income vs. expense): no facts under the chart, and a
   * flow's swatches at the top right, under the title's aside.
   */
  isCompact?: boolean;
}

/**
 * One Widget as a card of the Dashboard's grid: its name, a sentence saying what its chart
 * shows, the chart, and the facts behind it (GLOSSARY: Dashboard Story).
 */
export function WidgetCard({
  card,
  className = '',
  toolbar,
  titleAside,
  isCompact = false,
}: WidgetCardProps) {
  const fmt = useFormatter();
  const money: Money = (minor) => fmt.amount(minor, { currency: 'CHF', isWhole: true });
  const reading = readCard(card, money);
  const hasLegendInHeader = isCompact && reading.mark.type === 'areas';
  const facts = isCompact ? [] : reading.facts;
  return (
    <section
      aria-labelledby={`card-${card.id}`}
      className={`${WIDGET_CARD_CLASS} flex flex-col gap-4 ${className}`}
    >
      {toolbar}
      <div>
        <TitleRow aside={titleAside}>
          <h2 id={`card-${card.id}`} className="font-medium">
            {card.name}
          </h2>
        </TitleRow>
        {/* A compact flow's legend: on the headline's line, at the right under the title's aside. */}
        {hasLegendInHeader && (
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-muted">{reading.lead?.headline}</p>
            <FlowSwatches className="ml-auto justify-end" />
          </div>
        )}
        {reading.lead && (
          <>
            {!hasLegendInHeader && (
              <p className="mt-1 text-sm text-muted">{reading.lead.headline}</p>
            )}
            <p
              data-testid="card-lead"
              className={`font-display tracking-tight tabular-nums ${CARD_LEAD_SIZE_CLASS}`}
            >
              <FigureLink href={reading.lead.href}>{reading.lead.detail}</FigureLink>
            </p>
          </>
        )}
      </div>
      {card.error && <FieldError message={card.error} />}
      {card.unconvertedCount > 0 && (
        <p className="text-sm text-warning">{card.unconvertedCount} left out: no FX rate yet.</p>
      )}
      <CardBody mark={reading.mark} money={money} hasLegendInHeader={hasLegendInHeader} />
      {facts.length > 0 && (
        <dl className="grid grid-cols-1 gap-3 border-t border-rule pt-3 @2xs:grid-cols-2 @2xl:grid-cols-3">
          {facts.map((fact) => (
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
