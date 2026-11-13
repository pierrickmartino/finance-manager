import { BOARD_GAP_PX, BOARD_ROW_HEIGHT_PX, defaultSize, type Place } from './board';
import { chapterKind, type ChapterKind, type ChapterSource } from './story';

/** What a Widget's card placeholder is read from: known before its query has run. */
export type PlaceholderSource = Pick<ChapterSource, 'source' | 'visualisation'> & {
  layout: Place | null;
};

/** The quiet mark a placeholder draws: a figure, tick rows, a ring, a grid of cells or bars. */
export type PlaceholderShape = 'number' | 'ticks' | 'ring' | 'grid' | 'bars';

/**
 * The card draws ticks for parts, and dots or bars per period for both trends and bars. Whether
 * a bar chart becomes a ranking depends on its series, unknown until the query has run.
 */
const SHAPES: Record<ChapterKind, PlaceholderShape> = {
  number: 'number',
  share: 'ticks',
  ranking: 'ticks',
  ring: 'ring',
  grid: 'grid',
  trend: 'bars',
  bars: 'bars',
};

/** How a Widget's card is drawn while its query runs. */
export interface CardPlaceholder {
  /** The mark it hints at: the one the card draws for its chapter kind. */
  shape: PlaceholderShape;
  /** Its height in px where cards read as one column (the board's cells size it elsewhere). */
  height: number;
}

/** How tall `rows` board rows are, with the gaps between them. */
function rowsHeight(rows: number): number {
  return rows * BOARD_ROW_HEIGHT_PX + (rows - 1) * BOARD_GAP_PX;
}

/** The placeholder a Widget's card shows on the Dashboard Story until its chapter arrives. */
export function cardPlaceholder(widget: PlaceholderSource): CardPlaceholder {
  // Before the query has run there is no data: the chapter is read from the Widget alone.
  const chapter = { source: widget.source, visualisation: widget.visualisation, data: null };
  const rows = widget.layout?.h ?? defaultSize(chapter).h;
  return { shape: SHAPES[chapterKind(chapter)], height: rowsHeight(rows) };
}
