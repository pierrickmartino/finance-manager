'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import {
  HERO_ICON_BUTTON_CLASS,
  HERO_PILL_ACTIVE,
  HERO_PILL_CLASS,
  HERO_PILL_IDLE,
  HERO_PRIMARY_BUTTON_CLASS,
  HERO_SECONDARY_BUTTON_CLASS,
} from './hero-styles';
import { Icon } from './icon';
import { MobileDrawer } from './mobile-drawer';
import { MoreMenu } from './more-menu';
import { PRIMARY_LINKS, isActive } from './navigation';

/**
 * The navy bar on every signed-in page, one row: brand, the pills and More from `lg` (the menu
 * button below it), then the quick actions, settings and sign out.
 */
function TopBar({ pathname, onOpenMenu }: { pathname: string; onOpenMenu: () => void }) {
  return (
    <header className="flex h-12 items-center gap-2 px-3 text-on-hero md:px-5">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMenu}
        className={`${HERO_ICON_BUTTON_CLASS} lg:hidden`}
      >
        <Icon name="menu" />
      </button>
      <Link href="/" className="mr-3 flex items-center gap-1.5 font-display text-base">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
        Finance Manager
      </Link>
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {PRIMARY_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`${HERO_PILL_CLASS} ${active ? HERO_PILL_ACTIVE : HERO_PILL_IDLE}`}
            >
              <Icon name={link.icon} className="h-3.5 w-3.5" />
              {link.label}
            </Link>
          );
        })}
        <MoreMenu pathname={pathname} />
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        {/* Statements are imported from an Account's page: pick the Account there. */}
        <Link href="/accounts" className={`${HERO_SECONDARY_BUTTON_CLASS} hidden md:block`}>
          Import statement
        </Link>
        <Link href="/unclassified" className={`${HERO_PRIMARY_BUTTON_CLASS} hidden md:block`}>
          Review unclassified
        </Link>
        <Link href="/settings" aria-label="Settings" className={HERO_ICON_BUTTON_CLASS}>
          <Icon name="settings" />
        </Link>
        <form action={logoutAction}>
          <button type="submit" aria-label="Sign out" className={HERO_ICON_BUTTON_CLASS}>
            <Icon name="signOut" />
          </button>
        </form>
      </div>
    </header>
  );
}

interface AppShellProps {
  /** Signed out (login, setup), only the page renders: no hero, top bar or drawer. */
  showNavigation: boolean;
  children: ReactNode;
}

/**
 * The page layout, full width and dense: one slim navy bar carries the brand, the main pages as
 * pills (the rest under More) and the quick actions; the page sits on a paper panel that rises
 * out of the navy just below it. Below `lg` the pills give way to a drawer opened from the bar.
 *
 * `children` keeps the same position in the tree whether or not the navigation shows, so a page
 * whose action signs the user in (first-run setup shows its recovery codes afterwards) is not
 * remounted, and loses no state, when the navigation appears.
 */
export function AppShell({ showNavigation, children }: AppShellProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Nothing clips the page: a menu that drops past the end of a page must still be reachable,
  // and sticky columns must stick.
  const main = showNavigation
    ? 'mx-2 mt-1 mb-4 rounded-xl bg-paper px-4 py-5 shadow-lg shadow-hero/10 md:mx-4 md:px-6'
    : 'mx-auto w-full max-w-5xl px-4 py-8 md:px-6';

  return (
    <div className={`relative min-h-screen ${showNavigation ? 'bg-sunken' : 'bg-paper'}`}>
      {showNavigation && (
        <div aria-hidden="true" className="bg-hero absolute inset-x-0 top-0 h-28" />
      )}
      <div className="relative">
        {showNavigation && <TopBar pathname={pathname} onOpenMenu={() => setIsMenuOpen(true)} />}
        <main className={main}>{children}</main>
      </div>

      {showNavigation && isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}
