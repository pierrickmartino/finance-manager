import type { CSSProperties, ReactNode } from 'react';
import { BOARD_ROW_HEIGHT_PX } from '@/lib/reporting/board';
import type { WidgetLayout } from '@/server/services/reporting';
import type { WidgetCardData } from '@/lib/reporting/card';
import { WidgetCard } from './widget-card';

/** A Widget's card data with the card's place and size on the board. */
export interface BoardCard extends WidgetCardData {
  layout: WidgetLayout | null;
}

/** Where a card sits at `lg` and above: CSS grid lines are counted from 1. */
function placement(layout: WidgetLayout | null): CSSProperties | undefined {
  if (!layout) return undefined;
  return {
    '--board-column': `${layout.x + 1} / span ${layout.w}`,
    '--board-row': `${layout.y + 1} / span ${layout.h}`,
  } as CSSProperties;
}

/**
 * The Dashboard's board (ADR-0010). At `lg` and above, each card is drawn at its stored place
 * and size on a 12-column grid of fixed-height rows, gaps kept. Below `lg`, the cards are one
 * column in reading order (cells come in reading order: by row, then column), which is also the
 * order screen readers follow at every width.
 */
export function BoardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="dashboard-board flex flex-col gap-5 lg:grid lg:grid-cols-12"
      style={{ gridAutoRows: `${BOARD_ROW_HEIGHT_PX}px` }}
    >
      {children}
    </div>
  );
}

/** One card's cell of the board, at its stored place and size from `lg` up. */
export function BoardCell({
  layout,
  children,
}: {
  layout: WidgetLayout | null;
  children: ReactNode;
}) {
  return (
    <div
      className="dashboard-board-cell min-h-0 lg:[grid-column:var(--board-column)] lg:[grid-row:var(--board-row)]"
      style={placement(layout)}
    >
      {children}
    </div>
  );
}

/** The class a Widget's card takes in its cell: it fills the cell, and content that doesn't fit scrolls. */
export const BOARD_CARD_CLASS = 'lg:h-full lg:overflow-auto';

interface WidgetBoardProps<T extends BoardCard> {
  /** In reading order. */
  cards: T[];
  /** Edit mode's actions on each card. */
  toolbar?: (card: T) => ReactNode;
}

/** The board with every card already loaded, as Edit mode draws it. */
export function WidgetBoard<T extends BoardCard>({ cards, toolbar }: WidgetBoardProps<T>) {
  return (
    <BoardGrid>
      {cards.map((card) => (
        <BoardCell key={card.id} layout={card.layout}>
          <WidgetCard card={card} className={BOARD_CARD_CLASS} toolbar={toolbar?.(card)} />
        </BoardCell>
      ))}
    </BoardGrid>
  );
}
