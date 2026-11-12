'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { VARIANT_FONTS } from '@/app/prototype-layout/fonts';
import '@/app/prototype-layout/variants.css';
import { LAYOUT_VARIANTS, parseVariant } from '@/app/prototype-layout/variant';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { greetingFor } from './greeting';
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
import { PRIMARY_LINKS, findCurrentPage, isActive } from './navigation';

const subscribeToNothing = () => () => {};

/** The greeting by the browser's clock; the server, which can't know it, says hello. */
function Greeting() {
  const text = useSyncExternalStore(
    subscribeToNothing,
    () => greetingFor(new Date()),
    () => 'Hello',
  );
  return <p className="font-display text-4xl tracking-tight md:text-5xl">{text}.</p>;
}

/** "Money / Transactions" for the current page; nothing for pages outside the navigation. */
function Breadcrumb({ pathname }: { pathname: string }) {
  const current = findCurrentPage(pathname);
  if (!current) return null;
  return (
    <p data-testid="breadcrumb" className="mt-3 flex items-center gap-2 text-base">
      <span className="text-on-hero/65">{current.group.label}</span>
      <span aria-hidden="true" className="text-on-hero/45">
        /
      </span>
      <span className="text-on-hero">{current.link.label}</span>
    </p>
  );
}

/** Brand, the pills and More from `lg`; the menu button below it; settings and sign out. */
function TopBar({ pathname, onOpenMenu }: { pathname: string; onOpenMenu: () => void }) {
  return (
    <header className="flex h-20 items-center gap-3 px-5 md:px-8">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMenu}
        className={`${HERO_ICON_BUTTON_CLASS} lg:hidden`}
      >
        <Icon name="menu" className="h-5 w-5" />
      </button>
      <Link href="/" className="flex items-center gap-2 font-display text-2xl text-on-hero">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent" />
        Finance Manager
      </Link>
      <nav aria-label="Main" className="mx-auto hidden items-center gap-2 lg:flex">
        {PRIMARY_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`${HERO_PILL_CLASS} ${active ? HERO_PILL_ACTIVE : HERO_PILL_IDLE}`}
            >
              <Icon name={link.icon} />
              {link.label}
            </Link>
          );
        })}
        <MoreMenu pathname={pathname} />
      </nav>
      <div className="ml-auto hidden items-center gap-2 md:flex lg:ml-0">
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
 * The page layout: the app in a rounded frame on a grey canvas. A deep-teal hero carries the
 * brand, the main pages as pills (the rest under More), a greeting with where you are, and the
 * quick actions; the page sits on a paper panel that rises out of the hero's fade. Below `lg`
 * the pills give way to a drawer opened from the top bar.
 *
 * `children` keeps the same position in the tree whether or not the navigation shows, so a page
 * whose action signs the user in (first-run setup shows its recovery codes afterwards) is not
 * remounted, and loses no state, when the navigation appears.
 */
export function AppShell({ showNavigation, children }: AppShellProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // PROTOTYPE (layout redesign): `?variant=A|B|C` goes full width and takes the variant's
  // colour, font and rounding (src/app/prototype-layout). Throwaway.
  const variant = parseVariant(useSearchParams().get('variant'));
  const isFullWidth = showNavigation && variant !== 'current';

  // The frame clips nothing (its corners come from the hero's own rounding): a menu that drops
  // past the end of a page must still be reachable, and sticky columns must stick.
  const frame = !showNavigation
    ? ''
    : isFullWidth
      ? 'relative min-h-screen bg-sunken'
      : 'relative mx-auto min-h-screen max-w-[1400px] bg-sunken md:min-h-[calc(100vh-3rem)] md:rounded-[28px] md:shadow-2xl md:shadow-hero/25';
  const main = showNavigation
    ? 'mx-3 mb-6 rounded-3xl bg-paper px-4 py-8 shadow-xl shadow-hero/10 md:mx-8 md:mb-8 md:px-8'
    : 'mx-auto w-full max-w-5xl px-4 py-8 md:px-6';
  const outer = !showNavigation
    ? 'min-h-screen bg-paper'
    : isFullWidth
      ? `${VARIANT_FONTS[variant]} min-h-screen bg-sunken`
      : 'min-h-screen bg-canvas md:p-6';

  return (
    <div className={outer} data-proto={isFullWidth ? variant : undefined}>
      <div className={frame}>
        {showNavigation && (
          <div
            aria-hidden="true"
            className={`bg-hero absolute inset-x-0 top-0 h-[600px] ${isFullWidth ? '' : 'md:rounded-t-[28px]'}`}
          />
        )}
        <div className="relative">
          {showNavigation && (
            <>
              <TopBar pathname={pathname} onOpenMenu={() => setIsMenuOpen(true)} />
              <div className="flex flex-wrap items-end justify-between gap-6 px-5 pt-6 pb-10 text-on-hero md:px-8">
                <div>
                  <Greeting />
                  <Breadcrumb pathname={pathname} />
                </div>
                <div className="flex flex-wrap gap-3">
                  {/* Statements are imported from an Account's page: pick the Account there. */}
                  <Link href="/accounts" className={HERO_SECONDARY_BUTTON_CLASS}>
                    Import statement
                  </Link>
                  <Link href="/unclassified" className={HERO_PRIMARY_BUTTON_CLASS}>
                    Review unclassified
                  </Link>
                </div>
              </div>
            </>
          )}
          <main className={main}>{children}</main>
        </div>
      </div>

      {showNavigation && isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
      {showNavigation && <PrototypeSwitcher variants={LAYOUT_VARIANTS} current={variant} />}
    </div>
  );
}
