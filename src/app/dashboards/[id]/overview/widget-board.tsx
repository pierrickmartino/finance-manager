import type { CSSProperties, ReactNode } from 'react';
import type { WidgetLayout } from '@/server/services/reporting';
import type { StoryChapter } from '../story/chapter';
import { WidgetCard } from './widget-card';

/** A Widget's chapter with its card's place and size on the board. */
export interface BoardChapter extends StoryChapter {
  layout: WidgetLayout | null;
}

/** The height of one board row, in px; a card `h` rows tall also spans the `h - 1` gaps. */
export const BOARD_ROW_HEIGHT_PX = 40;
/** The gap between cards and between rows, in px (Tailwind `gap-5`). */
export const BOARD_GAP_PX = 20;

/** Where a card sits at `lg` and above: CSS grid lines are counted from 1. */
function placement(layout: WidgetLayout | null): CSSProperties | undefined {
  if (!layout) return undefined;
  return {
    '--board-column': `${layout.x + 1} / span ${layout.w}`,
    '--board-row': `${layout.y + 1} / span ${layout.h}`,
  } as CSSProperties;
}

/**
 * The Dashboard's board (ADR-0010). At `lg` and above, each Widget's card is drawn at its
 * stored place and size on a 12-column grid of fixed-height rows, gaps kept; content that
 * doesn't fit scrolls inside its card. Below `lg`, the cards are one column in reading order
 * (`chapters` come in reading order: by row, then column), which is also the order screen
 * readers follow at every width.
 */
export function WidgetBoard<T extends BoardChapter>({
  chapters,
  toolbar,
}: {
  chapters: T[];
  /** Edit mode's actions on each card. */
  toolbar?: (chapter: T) => ReactNode;
}) {
  return (
    <div
      className="dashboard-board flex flex-col gap-5 lg:grid lg:grid-cols-12"
      style={{ gridAutoRows: `${BOARD_ROW_HEIGHT_PX}px` }}
    >
      {chapters.map((chapter) => (
        <div
          key={chapter.id}
          className="dashboard-board-cell min-h-0 lg:[grid-column:var(--board-column)] lg:[grid-row:var(--board-row)]"
          style={placement(chapter.layout)}
        >
          <WidgetCard
            chapter={chapter}
            className="lg:h-full lg:overflow-auto"
            toolbar={toolbar?.(chapter)}
          />
        </div>
      ))}
    </div>
  );
}
