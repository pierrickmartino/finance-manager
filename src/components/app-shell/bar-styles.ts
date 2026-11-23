/** Controls that sit on the app shell's 48px bar, on the navy page (docs/design-system.md, "The app shell"). */

/** A pill of the top bar; the current page's is marked in the accent, as in the drawer. */
export const BAR_PILL_CLASS =
  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap transition-colors';
export const BAR_PILL_ACTIVE = 'bg-accent-tint font-medium text-accent-ink ring-1 ring-accent/40';
export const BAR_PILL_IDLE = 'text-on-ramp/75 hover:bg-on-ramp/10 hover:text-on-ramp';

/** A square icon button (settings, sign out, the menu on small screens). */
export const BAR_ICON_BUTTON_CLASS =
  'grid h-8 w-8 shrink-0 place-items-center rounded-md text-on-ramp/85 hover:bg-on-ramp/10 hover:text-on-ramp';

/** The bar's main action: the primary button's near-white fill, so it is the first thing seen. */
export const BAR_PRIMARY_BUTTON_CLASS =
  'rounded-md bg-ink px-2.5 py-1 text-[13px] font-medium text-paper hover:bg-ink-hover';
/** The bar's other actions: outlined. */
export const BAR_SECONDARY_BUTTON_CLASS =
  'rounded-md px-2.5 py-1 text-[13px] text-on-ramp ring-1 ring-on-ramp/40 hover:bg-on-ramp/10';
