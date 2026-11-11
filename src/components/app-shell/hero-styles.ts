/** Controls that sit on the hero's deep teal (docs/design-system.md, "The hero"). */

/** A pill of the top bar. */
export const HERO_PILL_CLASS =
  'flex items-center gap-2 rounded-full px-4 py-2 text-sm whitespace-nowrap transition-colors';
export const HERO_PILL_ACTIVE = 'bg-on-hero/20 text-on-hero shadow-inner ring-1 ring-on-hero/25';
export const HERO_PILL_IDLE =
  'bg-on-hero/5 text-on-hero/75 ring-1 ring-on-hero/10 hover:bg-on-hero/10 hover:text-on-hero';

/** A round icon button (settings, sign out, the menu on small screens). */
export const HERO_ICON_BUTTON_CLASS =
  'grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-hero/85 ring-1 ring-on-hero/25 hover:bg-on-hero/10 hover:text-on-hero';

/** The hero's main action: solid white, so it is the first thing seen. */
export const HERO_PRIMARY_BUTTON_CLASS =
  'rounded-full bg-on-hero px-5 py-2.5 text-sm font-medium text-hero shadow-lg hover:bg-on-hero/90';
/** The hero's other actions: outlined. */
export const HERO_SECONDARY_BUTTON_CLASS =
  'rounded-full px-5 py-2.5 text-sm text-on-hero ring-1 ring-on-hero/60 hover:bg-on-hero/10';
