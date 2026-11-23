/*
 * How a Widget's Card lays out from its own width (docs/design-system.md, "Breakpoints"), shared
 * by the loaded Card and its placeholder so one edit changes both. Plain values, not a client
 * module, so the server-rendered placeholder can read them too.
 */

/** The ring's geometry, in px: its box (and viewBox), and its outer and inner radii. */
export const RING = { size: 160, outer: 78, inner: 52 } as const;

/** A ring and its list: the list below the ring under `@md`, beside it from `@md`. */
export const RING_LAYOUT_CLASS = 'flex flex-col items-center gap-6 @md:flex-row';

/** A ring's list: the Card's width below the ring, the rest of the row beside it. */
export const RING_LIST_CLASS = 'flex w-full flex-col @md:w-auto @md:flex-1';

/**
 * The lead figure's size: a size down on a narrow Card (Analytics' thirds, small board cells),
 * full from `@md`. The placeholder's lead line takes it too, so it is the lead's own height.
 */
export const CARD_LEAD_SIZE_CLASS = 'text-xl @md:text-3xl';
