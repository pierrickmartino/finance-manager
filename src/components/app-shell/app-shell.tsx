'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import {
  BAR_ICON_BUTTON_CLASS,
  BAR_PILL_ACTIVE,
  BAR_PILL_CLASS,
  BAR_PILL_IDLE,
  BAR_PRIMARY_BUTTON_CLASS,
  BAR_SECONDARY_BUTTON_CLASS,
} from './bar-styles';
import { Icon } from './icon';
import { MobileDrawer } from './mobile-drawer';
import { MoreMenu } from './more-menu';
import { PRIMARY_LINKS, isActive } from './navigation';

/**
 * The 48px bar on every signed-in page, sitting on the navy page, one row: brand, the pills and
 * More from `lg` (the menu button below it), then the quick actions, settings and sign out.
 */
function TopBar({ pathname, onOpenMenu }: { pathname: string; onOpenMenu: () => void }) {
  return (
    <header className="flex h-12 items-center gap-2 px-3 text-on-ramp md:px-5">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMenu}
        className={`${BAR_ICON_BUTTON_CLASS} lg:hidden`}
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
              className={`${BAR_PILL_CLASS} ${active ? BAR_PILL_ACTIVE : BAR_PILL_IDLE}`}
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
        <Link href="/accounts" className={`${BAR_SECONDARY_BUTTON_CLASS} hidden md:block`}>
          Import statement
        </Link>
        <Link href="/unclassified" className={`${BAR_PRIMARY_BUTTON_CLASS} hidden md:block`}>
          Review unclassified
        </Link>
        <Link href="/settings" aria-label="Settings" className={BAR_ICON_BUTTON_CLASS}>
          <Icon name="settings" />
        </Link>
        <form action={logoutAction}>
          <button type="submit" aria-label="Sign out" className={BAR_ICON_BUTTON_CLASS}>
            <Icon name="signOut" />
          </button>
        </form>
      </div>
    </header>
  );
}

interface AppShellProps {
  /** Signed out (login, setup), only the page renders: no top bar or drawer. */
  showNavigation: boolean;
  children: ReactNode;
}

/**
 * The page layout, full width and dense: the page is the navy, and one slim bar on it carries
 * the brand, the main pages as pills (the rest under More) and the quick actions, with the page's
 * content right below. Below `lg` the pills give way to a drawer opened from the bar.
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
    ? 'px-4 pt-3 pb-6 md:px-6'
    : 'mx-auto w-full max-w-5xl px-4 py-8 md:px-6';

  return (
    <div className="relative min-h-screen">
      <div className="relative">
        {showNavigation && <TopBar pathname={pathname} onOpenMenu={() => setIsMenuOpen(true)} />}
        <main className={main}>{children}</main>
      </div>

      {showNavigation && isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}
