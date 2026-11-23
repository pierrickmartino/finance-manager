import { TILE_CLASS, WIDGET_CARD_CLASS } from '@/components/surface';

/** Every section's card: a tile that never widens the page (wide content scrolls inside). */
export const SECTION_CLASS = `${TILE_CLASS} flex min-w-0 flex-col gap-4`;

/** A Card section's frame (drawn as a Widget's Card): SECTION_CLASS on a Card container. */
const CARD_SECTION_CLASS = `${WIDGET_CARD_CLASS} flex min-w-0 flex-col gap-4`;

/**
 * The frame of a section's placeholder and error boundary: a Card section waits and fails in a
 * Card that lays out from its own width, as the loaded Card does; any other section in a tile.
 */
export function sectionFrameClass(isCard: boolean): string {
  return isCard ? CARD_SECTION_CLASS : SECTION_CLASS;
}
