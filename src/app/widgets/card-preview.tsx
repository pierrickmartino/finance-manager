import { editedCardSize, GRID_COLUMNS } from '@/lib/reporting/board';
import type { WidgetLayout } from '@/server/services/reporting';
import type { StoryChapter } from '../dashboards/(dashboard)/[id]/story/chapter';
import { WidgetBoard } from '../dashboards/(dashboard)/[id]/overview/widget-board';

interface CardPreviewProps {
  chapter: StoryChapter;
  /** The Widget's card on its Dashboard; null for a new or Standalone Widget. */
  layout: WidgetLayout | null;
}

/**
 * The Widget as the card it becomes on a Dashboard: the same card on the same board (ADR-0010),
 * at the size it has once saved, from the left edge. The board is the preview's width, so a
 * cell is narrower than on the Dashboard; the rows are the same height.
 */
export function CardPreview({ chapter, layout }: CardPreviewProps) {
  const { w, h } = editedCardSize(layout, chapter);
  return (
    <div>
      <WidgetBoard chapters={[{ ...chapter, layout: { x: 0, y: 0, w, h } }]} />
      <p className="mt-2 text-xs text-muted">
        {w} of {GRID_COLUMNS} columns, {h} rows on the Dashboard.
      </p>
    </div>
  );
}
