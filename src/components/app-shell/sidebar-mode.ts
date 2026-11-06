/**
 * The desktop sidebar is either pinned open (it takes its width beside the page) or a rail of
 * icons that peeks open over the page on hover or focus. The choice is kept in a cookie so the
 * server renders the right one and the page doesn't jump on load.
 */
export type SidebarMode = 'pinned' | 'rail';

export const SIDEBAR_COOKIE = 'sidebar';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** The saved mode; anything missing or unknown means the sidebar is pinned, as it always was. */
export function parseSidebarMode(value: string | undefined): SidebarMode {
  return value === 'rail' ? 'rail' : 'pinned';
}

/** A `document.cookie` assignment that saves `mode` for every page. */
export function sidebarModeCookie(mode: SidebarMode): string {
  return `${SIDEBAR_COOKIE}=${mode}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
