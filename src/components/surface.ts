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
  'rounded-md border border-warning-rule bg-warning-tint px-3 py-2 text-warning';
/** A card of the Dashboard's grid: a little rounder and roomier than CARD_CLASS. */
export const TILE_CLASS = 'rounded-3xl border border-rule bg-surface p-5 shadow-sm';

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
/** Destructive actions: delete, remove. Text only, so they never look like the main action. */
export const DANGER_BUTTON_CLASS = 'text-sm font-medium text-negative hover:underline';
