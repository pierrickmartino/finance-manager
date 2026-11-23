/**
 * The design system's shared class names (docs/design-system.md). Pages name what an element
 * is (a page title, a primary button, a card) and take its look from here, so the style lives
 * in one place. Colours are design tokens (globals.css); never use raw palette classes.
 */

// Type -----------------------------------------------------------------------------------------

/** The page's one h1: the display face, kept compact so the page's content comes first. */
export const PAGE_TITLE_CLASS = 'font-display text-2xl leading-tight tracking-tight text-pretty';
/** A section within a page (h2), and the title of a detail panel: the display face, one step down. */
export const SECTION_TITLE_CLASS = 'font-display text-lg leading-snug tracking-tight';
/** A number that is the point of its page (a balance, a total), in the display face. */
export const HEADLINE_AMOUNT_CLASS = 'font-display text-3xl tracking-tight tabular-nums';
/**
 * A Key figure's amount, one of a row of tiles: the headline amount from `sm` up, a step smaller
 * on phones where two tiles share the width, and free to wrap after its Currency, never cut.
 */
export const TILE_AMOUNT_CLASS =
  'font-display text-xl leading-tight tracking-tight tabular-nums sm:text-3xl';

// Surfaces -------------------------------------------------------------------------------------

/**
 * Glass, for containers only (ADR-0017): a translucent `surface` fill that blurs the page and
 * its glow behind it, inside a thin luminous border. The card, tile, popover, dock and notice
 * primitives use it; inputs, table rows, badges and buttons stay solid. Under reduced
 * transparency, or without backdrop-filter, the fill is opaque (one rule in globals.css).
 */
export const GLASS_CLASS = 'border border-ink/12 glass-surface';
/**
 * The soft cyan inner glow of the Dashboard's and Analytics' tiles (with their small shadow),
 * so the cards read for insight stand out from working lists. Tiles only: TILE_CLASS has it.
 */
export const TILE_GLOW_CLASS = 'tile-glow';

/** A separate object on the page: a list, a detail panel, a Widget. Use by role, not for every block. */
export const CARD_CLASS = `rounded-xl ${GLASS_CLASS} shadow-sm`;
/**
 * A notice that asks for attention (stale FX rates, a Balance snapshot mismatch): warning text
 * on warning-tint glass, inside a warning rule. Give the element `role="alert"`.
 */
export const WARNING_NOTICE_CLASS =
  'rounded-md border border-warning-rule glass-warning-tint px-3 py-2 text-warning';
/**
 * A quiet notice about the view's own state, which asks for nothing (all N on this page are
 * selected): soft ink on sunken glass. Not an alert: attention takes WARNING_NOTICE_CLASS.
 */
export const INFO_NOTICE_CLASS =
  'rounded-lg border border-ink/12 glass-sunken px-3 py-2 text-sm text-ink-soft';
/**
 * A glass toolbar floating over the page's bottom edge while something is selected (the
 * Transactions list's Bulk edit dock): ringed in cyan above a deep shadow, so it reads as a
 * tool above the page, not part of it.
 */
export const DOCK_CLASS =
  'rounded-xl border border-accent/60 glass-surface p-1.5 text-sm text-ink shadow-2xl';
/**
 * An action on DOCK_CLASS: ink text, a translucent ink fill on hover or while its popover is
 * open (`aria-expanded`), and the global accent-ink focus ring, which passes on the dock.
 */
export const DOCK_BUTTON_CLASS =
  'flex items-center gap-2 rounded-md px-3 py-1.5 font-medium hover:bg-ink/10 aria-expanded:bg-ink/15 disabled:opacity-50';
/** A popover over the page: a menu or picker opened from a toolbar or the dock. */
export const POPOVER_CLASS = `rounded-xl ${GLASS_CLASS} p-2 text-ink shadow-xl`;
/**
 * One tile of a row of exclusive choices (the Widget editor's source and visualisation): a
 * bordered surface, the chosen one ringed in ink. A link tile is chosen by
 * `aria-current="page"`, a `<label>` tile by its checked radio, which shows its focus ring.
 */
export const CHOICE_TILE_CLASS =
  'rounded-md border border-rule-strong bg-surface hover:border-faint aria-[current=page]:border-ink aria-[current=page]:ring-2 aria-[current=page]:ring-ink has-checked:border-ink has-checked:ring-2 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-ink';
/** A card of the Dashboard's grid: a little rounder and roomier than CARD_CLASS. */
export const TILE_CLASS = `rounded-3xl ${GLASS_CLASS} ${TILE_GLOW_CLASS} p-5`;

/**
 * A quiet block standing in for content still loading (a card's chart, a line of text): a
 * sunken fill that pulses gently, still under reduced motion. Decorative: mark its container busy.
 */
export const PLACEHOLDER_CLASS = 'rounded-md bg-sunken motion-safe:animate-pulse';

const BADGE_BASE = 'rounded-md px-2 py-0.5 text-xs font-medium';
/**
 * A short label beside a row's name (Missed, New), by tone: `warning` asks for attention,
 * `info` is neutral status, `neutral` is a plain fact. Tones carry meaning, never decoration.
 */
export const BADGE_CLASS = {
  warning: `${BADGE_BASE} bg-warning-tint text-warning ring-1 ring-warning-rule ring-inset`,
  info: `${BADGE_BASE} bg-info-tint text-info`,
  neutral: `${BADGE_BASE} bg-sunken text-ink-soft`,
} as const;
export type BadgeTone = keyof typeof BADGE_CLASS;

// Buttons --------------------------------------------------------------------------------------

/** The page's main action, one per view where possible: a near-white ink fill under navy text. */
export const PRIMARY_BUTTON_CLASS =
  'rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink-hover disabled:opacity-50';
/**
 * The main action of the Dashboard Story's own views (Done in Edit mode, Save in the Widget
 * editor): a cyan fill under navy text.
 */
export const ACCENT_BUTTON_CLASS =
  'rounded-md bg-accent-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-accent disabled:opacity-50';
/** Any other action; also links styled as buttons. */
export const SECONDARY_BUTTON_CLASS =
  'rounded-md border border-rule-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-sunken disabled:opacity-40';
/** The compact secondary button of dense lists and rows. */
export const SMALL_BUTTON_CLASS =
  'rounded-md border border-rule-strong bg-surface px-2 py-1 text-xs font-medium text-ink hover:bg-sunken disabled:opacity-40';
/** A pill-shaped action on the Dashboard's tiles (Edit Dashboard, See the Transactions). */
export const PILL_BUTTON_CLASS =
  'rounded-lg border border-rule bg-surface px-4 py-1.5 text-sm font-medium text-ink shadow-sm hover:bg-sunken';
/** A quiet action that sits inside a row or toolbar. */
export const GHOST_BUTTON_CLASS =
  'rounded-md px-2 py-1 text-sm font-medium text-ink-soft hover:bg-sunken hover:text-ink disabled:opacity-30';
/**
 * A quiet step link of a toolbar, such as Previous / Next on a Transaction detail: soft ink,
 * underlined on hover. Its `_DISABLED` twin is the same step at an end, not a link: faint.
 */
export const STEP_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:underline';
export const STEP_LINK_DISABLED_CLASS =
  'inline-flex items-center gap-1.5 text-sm font-medium text-faint';
/** A keyboard shortcut's hint beside the control it triggers (`j`, `k`): a small key cap. */
export const KEY_HINT_CLASS =
  'rounded-md border border-rule bg-sunken px-1 font-mono text-xs leading-4 font-normal text-muted';
/** A button that reads as a link within a sentence or notice (Select all N matching). */
export const LINK_BUTTON_CLASS = 'font-medium text-ink underline hover:no-underline';
/** Destructive actions: delete, remove. Text only, so they never look like the main action. */
export const DANGER_BUTTON_CLASS = 'text-sm font-medium text-negative hover:underline';
