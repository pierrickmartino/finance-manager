/** Controls that sit on the app shell's navy bar (docs/design-system.md, "The app shell"). */

/** A pill of the top bar. */
export const HERO_PILL_CLASS =
  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap transition-colors';
export const HERO_PILL_ACTIVE = 'bg-on-hero/20 text-on-hero shadow-inner ring-1 ring-on-hero/25';
export const HERO_PILL_IDLE = 'text-on-hero/75 hover:bg-on-hero/10 hover:text-on-hero';

/** A square icon button (settings, sign out, the menu on small screens). */
export const HERO_ICON_BUTTON_CLASS =
  'grid h-8 w-8 shrink-0 place-items-center rounded-md text-on-hero/85 hover:bg-on-hero/10 hover:text-on-hero';

/** The bar's main action: solid white, so it is the first thing seen. */
export const HERO_PRIMARY_BUTTON_CLASS =
  'rounded-md bg-on-hero px-2.5 py-1 text-[13px] font-medium text-hero hover:bg-on-hero/90';
/** The bar's other actions: outlined. */
export const HERO_SECONDARY_BUTTON_CLASS =
  'rounded-md px-2.5 py-1 text-[13px] text-on-hero ring-1 ring-on-hero/40 hover:bg-on-hero/10';
