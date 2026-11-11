'use client';

/**
 * PROTOTYPE — throwaway. Variant B, "Hero canvas + top pills": the closest to the screenshot.
 * The app sits in a rounded frame on a grey canvas; a deep-teal hero carries the brand, the
 * main destinations as pills (the rest under "More"), a greeting and the page's quick actions.
 * The page then rises out of the hero's fade.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Icon, type IconName } from './icon';
import { MobileDrawer } from './mobile-drawer';
import { NAV_GROUPS, findCurrentPage, isActive } from './navigation';
import { HERO_GRADIENT, greeting } from './prototype-layouts';

const PILLS: { href: string; label: string; icon: IconName }[] = [
  { href: '/dashboards', label: 'Overview', icon: 'dashboard' },
  { href: '/transactions', label: 'Transactions', icon: 'transactions' },
  { href: '/accounts', label: 'Accounts', icon: 'accounts' },
  { href: '/categories', label: 'Categories', icon: 'categories' },
];
const PILL_HREFS = new Set(PILLS.map((pill) => pill.href));

const PILL = 'flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors';
const PILL_ACTIVE = 'bg-white/20 text-white shadow-inner ring-1 ring-white/25 backdrop-blur';
const PILL_IDLE =
  'bg-white/5 text-white/75 ring-1 ring-white/10 hover:bg-white/10 hover:text-white';
const ROUND = 'grid h-10 w-10 place-items-center rounded-full ring-1 ring-white/25 text-white/85';

function MoreMenu({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const isMoreActive = !PILLS.some((pill) => isActive(pathname, pill.href));
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`${PILL} ${isMoreActive ? PILL_ACTIVE : PILL_IDLE}`}
      >
        <Icon name="menu" />
        More
      </button>
      {isOpen && (
        <div className="absolute top-12 left-1/2 z-40 grid w-[28rem] -translate-x-1/2 grid-cols-2 gap-4 rounded-2xl border border-rule bg-surface p-4 shadow-2xl">
          {NAV_GROUPS.map((group) => {
            const links = group.links.filter((link) => !PILL_HREFS.has(link.href));
            if (links.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="px-2 pb-1 text-xs text-muted">{group.label}</p>
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken ${isActive(pathname, link.href) ? 'font-medium text-accent-ink' : 'text-ink-soft'}`}
                  >
                    <Icon name={link.icon} />
                    {link.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HeroLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = findCurrentPage(pathname);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#e9ecee] p-0 md:p-6">
      <div className="relative mx-auto min-h-screen max-w-[1400px] overflow-hidden bg-[#f3f5f6] md:min-h-[calc(100vh-3rem)] md:rounded-[28px] md:shadow-[0_30px_80px_-30px_rgba(10,47,60,0.45)]">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[600px]"
          style={{
            background: HERO_GRADIENT,
            maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
          }}
        />
        <div className="relative">
          <header className="flex h-20 items-center gap-4 px-5 md:px-8">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setIsMenuOpen(true)}
              className={`${ROUND} md:hidden`}
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <Link href="/" className="flex items-center gap-2 font-display text-2xl text-white">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
              Finance Manager
            </Link>
            <nav aria-label="Main" className="mx-auto hidden items-center gap-2 lg:flex">
              {PILLS.map((pill) => (
                <Link
                  key={pill.href}
                  href={pill.href}
                  aria-current={isActive(pathname, pill.href) ? 'page' : undefined}
                  className={`${PILL} ${isActive(pathname, pill.href) ? PILL_ACTIVE : PILL_IDLE}`}
                >
                  <Icon name={pill.icon} />
                  {pill.label}
                </Link>
              ))}
              <MoreMenu pathname={pathname} />
            </nav>
            <div className="ml-auto hidden items-center gap-2 md:flex lg:ml-0">
              <Link href="/settings" aria-label="Settings" className={ROUND}>
                <Icon name="settings" />
              </Link>
              <form action={logoutAction}>
                <button type="submit" aria-label="Sign out" className={`${ROUND} bg-white/10`}>
                  <Icon name="signOut" />
                </button>
              </form>
            </div>
          </header>

          <div className="flex flex-wrap items-end justify-between gap-6 px-5 pt-6 pb-10 md:px-8">
            <div className="max-w-xl text-white">
              <p
                className="font-display text-4xl tracking-tight md:text-5xl"
                suppressHydrationWarning
              >
                {greeting()}.
              </p>
              <p className="mt-3 text-base text-white/75">
                {current
                  ? `${current.group.label} · ${current.link.label}. Where your money went, what changed, and what needs a look.`
                  : 'Where your money went, what changed, and what needs a look.'}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/imports"
                className="rounded-full px-5 py-2.5 text-sm text-white ring-1 ring-white/60 hover:bg-white/10"
              >
                Import statement
              </Link>
              <Link
                href="/unclassified"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#0f4352] shadow-lg hover:bg-white/90"
              >
                Review unclassified
              </Link>
            </div>
          </div>

          <main className="mx-4 mb-24 rounded-3xl bg-paper px-5 py-8 shadow-[0_10px_40px_-20px_rgba(10,47,60,0.35)] ring-1 ring-white/60 md:mx-8 md:px-8">
            {children}
          </main>
        </div>
      </div>
      {isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}
