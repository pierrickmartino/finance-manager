'use client';

/**
 * PROTOTYPE ONLY: three denser app shells (B, C, D) beside the current hero (A, in app-shell.tsx).
 * See shell-prototype.tsx. Delete with the prototype.
 */

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { SMALL_BUTTON_CLASS } from '@/components/surface';
import { HERO_PILL_ACTIVE, HERO_PILL_IDLE } from './hero-styles';
import { Icon } from './icon';
import { MobileDrawer } from './mobile-drawer';
import { MoreMenu } from './more-menu';
import { NAV_GROUPS, PRIMARY_LINKS, findCurrentPage, isActive } from './navigation';

interface VariantProps {
  pathname: string;
  children: ReactNode;
}

function Crumb({ pathname, className }: { pathname: string; className: string }) {
  const current = findCurrentPage(pathname);
  if (!current) return null;
  return (
    <p className={`flex items-center gap-1.5 ${className}`}>
      <span className="opacity-70">{current.group.label}</span>
      <span aria-hidden="true" className="opacity-50">
        /
      </span>
      <span>{current.link.label}</span>
    </p>
  );
}

// B: Slim navy bar ------------------------------------------------------------------------------
// The hero shrinks to one 48px bar: brand, smaller pills, quick actions and settings in a row.
// No greeting; a thin navy lip stays behind the top of the panel so the page still rises from it.

const SLIM_PILL = 'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap';
const SLIM_ICON =
  'grid h-8 w-8 shrink-0 place-items-center rounded-md text-on-hero/85 hover:bg-on-hero/10 hover:text-on-hero';

export function SlimBarShell({ pathname, children }: VariantProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  return (
    <div className="relative min-h-screen bg-sunken">
      <div aria-hidden="true" className="bg-hero absolute inset-x-0 top-0 h-28" />
      <div className="relative">
        <header className="flex h-12 items-center gap-2 px-3 text-on-hero md:px-5">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setIsMenuOpen(true)}
            className={`${SLIM_ICON} lg:hidden`}
          >
            <Icon name="menu" className="h-4 w-4" />
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
                  className={`${SLIM_PILL} ${active ? HERO_PILL_ACTIVE : 'text-on-hero/75 hover:bg-on-hero/10 hover:text-on-hero'}`}
                >
                  <Icon name={link.icon} className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              );
            })}
            <MoreMenu pathname={pathname} />
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/accounts"
              className="hidden rounded-md px-2.5 py-1 text-[13px] ring-1 ring-on-hero/40 hover:bg-on-hero/10 md:block"
            >
              Import statement
            </Link>
            <Link
              href="/unclassified"
              className="hidden rounded-md bg-on-hero px-2.5 py-1 text-[13px] font-medium text-hero hover:bg-on-hero/90 md:block"
            >
              Review unclassified
            </Link>
            <Link href="/settings" aria-label="Settings" className={SLIM_ICON}>
              <Icon name="settings" />
            </Link>
            <form action={logoutAction}>
              <button type="submit" aria-label="Sign out" className={SLIM_ICON}>
                <Icon name="signOut" />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-2 mt-1 mb-4 rounded-xl bg-paper px-4 py-5 shadow-lg shadow-hero/10 md:mx-4 md:px-6">
          {children}
        </main>
      </div>
      {isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}

// C: Light sidebar ------------------------------------------------------------------------------
// No hero. Every page listed in a 216px sidebar (no More menu); the page gets a slim sticky
// header carrying the breadcrumb and quick actions. Navy survives only in the brand mark.

const SIDE_LINK = 'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px]';

function SideNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mt-3 first:mt-0">
          <p className="px-2.5 pb-1 text-[11px] font-medium text-muted">{group.label}</p>
          <ul className="flex flex-col">
            {group.links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`${SIDE_LINK} ${active ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`}
                  >
                    <Icon name={link.icon} className="h-3.5 w-3.5 shrink-0" />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SidebarShell({ pathname, children }: VariantProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-paper lg:pl-54">
      <aside className="fixed inset-y-0 left-0 hidden w-54 flex-col border-r border-rule bg-surface lg:flex">
        <Link href="/" className="flex h-11 items-center gap-2 px-4 font-display text-[15px]">
          <span
            aria-hidden="true"
            className="grid h-6 w-6 place-items-center rounded-md bg-hero text-xs text-on-hero"
          >
            F
          </span>
          Finance Manager
        </Link>
        <SideNav pathname={pathname} />
        <form action={logoutAction} className="border-t border-rule p-2">
          <button
            type="submit"
            className={`${SIDE_LINK} w-full text-ink-soft hover:bg-sunken hover:text-ink`}
          >
            <Icon name="signOut" className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </aside>
      <header className="sticky top-0 z-30 flex h-11 items-center gap-2 border-b border-rule bg-paper/90 px-3 backdrop-blur md:px-5">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setIsMenuOpen(true)}
          className="grid h-8 w-8 place-items-center rounded-md text-ink-soft hover:bg-sunken lg:hidden"
        >
          <Icon name="menu" />
        </button>
        <Crumb pathname={pathname} className="text-[13px] text-ink-soft" />
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/accounts" className={SMALL_BUTTON_CLASS}>
            Import statement
          </Link>
          <Link
            href="/unclassified"
            className="rounded-md bg-ink px-2 py-1 text-xs font-medium text-paper hover:bg-ink-hover"
          >
            Review unclassified
          </Link>
        </div>
      </header>
      <main className="px-3 py-4 md:px-5">{children}</main>
      {isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}

// D: Icon rail + toolbar ------------------------------------------------------------------------
// Maximum density: a 52px navy rail of icons (labels on hover), a 36px toolbar with the
// breadcrumb as the page's location, and the page edge to edge with tight padding.

const RAIL_ICON = 'grid h-9 w-9 place-items-center rounded-md';

export function RailShell({ pathname, children }: VariantProps) {
  return (
    <div className="min-h-screen bg-paper pl-13">
      <aside className="bg-hero fixed inset-y-0 left-0 z-40 flex w-13 flex-col items-center gap-0.5 overflow-y-auto py-2">
        <Link href="/" aria-label="Finance Manager" className={`${RAIL_ICON} mb-1`}>
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent" />
        </Link>
        <nav aria-label="Main" className="flex flex-col items-center gap-0.5">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="flex flex-col items-center gap-0.5">
              {groupIndex > 0 && (
                <span aria-hidden="true" className="my-1 h-px w-6 bg-on-hero/20" />
              )}
              {group.links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    title={link.label}
                    aria-label={link.label}
                    aria-current={active ? 'page' : undefined}
                    className={`${RAIL_ICON} ${active ? HERO_PILL_ACTIVE : `${HERO_PILL_IDLE} ring-0`}`}
                  >
                    <Icon name={link.icon} />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <form action={logoutAction} className="mt-auto">
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className={`${RAIL_ICON} text-on-hero/75 hover:bg-on-hero/10`}
          >
            <Icon name="signOut" />
          </button>
        </form>
      </aside>
      <header className="sticky top-0 z-30 flex h-9 items-center gap-2 border-b border-rule bg-surface px-3">
        <Crumb pathname={pathname} className="text-xs text-ink-soft" />
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/accounts"
            className="rounded px-2 py-0.5 text-xs text-ink-soft hover:bg-sunken"
          >
            Import statement
          </Link>
          <Link
            href="/unclassified"
            className="rounded bg-ink px-2 py-0.5 text-xs font-medium text-paper hover:bg-ink-hover"
          >
            Review unclassified
          </Link>
        </div>
      </header>
      <main className="px-3 py-3">{children}</main>
    </div>
  );
}
