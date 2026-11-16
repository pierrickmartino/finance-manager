/**
 * The design system's shared class names (docs/design-system.md). Pages name what an element
 * is (a page title, a primary button, a card) and take its look from here, so the style lives
 * in one place. Colours are design tokens (globals.css); never use raw palette classes.
 */

// Type -----------------------------------------------------------------------------------------

/** The page's one h1: the display face, set large, as the Dashboard Story's titles. */
export const PAGE_TITLE_CLASS = 'font-display text-4xl leading-tight tracking-tight text-pretty';
/** A section within a page (h2): the display face, one step down. */
export const SECTION_TITLE_CLASS = 'font-display text-2xl leading-snug tracking-tight';
/** A number that is the point of its page (a balance, a total), in the display face. */
export const HEADLINE_AMOUNT_CLASS = 'font-display text-4xl tracking-tight tabular-nums';

// Surfaces -------------------------------------------------------------------------------------

/** A separate object on the page: a list, a detail panel, a Widget. Use by role, not for every block. */
export const CARD_CLASS = 'rounded-xl border border-rule bg-surface shadow-sm';
/**
 * A notice that asks for attention (stale FX rates, a Balance snapshot mismatch): warning text
 * on the warning tint, inside a warning rule. Give the element `role="alert"`.
 */
export const WARNING_NOTICE_CLASS =
  'warning-notice rounded-md border border-warning-rule bg-warning-tint px-3 py-2 text-warning'; // PROTOTYPE marker: warning-notice
/**
 * A quiet notice about the view's own state, which asks for nothing (all N on this page are
 * selected): soft ink on a sunken fill. Not an alert: attention takes WARNING_NOTICE_CLASS.
 */
export const INFO_NOTICE_CLASS = 'rounded-lg bg-sunken px-3 py-2 text-sm text-ink-soft';
/**
 * A dark toolbar floating over the page's bottom edge while something is selected (the
 * Transactions list's Bulk edit dock). Ink, so it reads as a tool above the page, not part of it.
 */
export const DOCK_CLASS = 'rounded-xl bg-ink p-1.5 text-sm text-paper shadow-2xl';
/**
 * An action on DOCK_CLASS: paper text, a translucent paper fill on hover or while its popover
 * is open (`aria-expanded`), and the accent fill as its focus ring (accent-ink fails on ink).
 */
export const DOCK_BUTTON_CLASS =
  'flex items-center gap-2 rounded-md px-3 py-1.5 font-medium hover:bg-paper/10 aria-expanded:bg-paper/15 focus-visible:outline-accent disabled:opacity-50';
/** A popover over the page: a menu or picker opened from a toolbar or the dock. */
export const POPOVER_CLASS = 'rounded-xl border border-rule bg-surface p-2 text-ink shadow-xl';
/** A card of the Dashboard's grid: a little rounder and roomier than CARD_CLASS. */
export const TILE_CLASS = 'rounded-3xl border border-rule bg-surface p-5 shadow-sm';

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
  warning: `warning-badge ${BADGE_BASE} bg-warning-tint text-warning ring-1 ring-warning-rule ring-inset`,
  info: `${BADGE_BASE} bg-info-tint text-info`,
  neutral: `${BADGE_BASE} bg-sunken text-ink-soft`,
} as const;
export type BadgeTone = keyof typeof BADGE_CLASS;

// Buttons --------------------------------------------------------------------------------------

/** The page's main action. One per view where possible. */
export const PRIMARY_BUTTON_CLASS =
  'rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink-hover disabled:opacity-50';
/**
 * The main action of the Dashboard Story's own views (Done in Edit mode, Save in the Widget
 * editor): the accent, darkened for AA, under paper text.
 */
export const ACCENT_BUTTON_CLASS =
  'rounded-md bg-accent-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink disabled:opacity-50';
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
