'use client';

/**
 * PROTOTYPE (layout redesign, `?variant=`): three app shells, all full width. Each owns its whole
 * layout; only the navigation data and icons are shared. Throwaway; see ./README.md.
 */
import Link from 'next/link';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { greetingFor } from '@/components/app-shell/greeting';
import { Icon } from '@/components/app-shell/icon';
import { MobileDrawer } from '@/components/app-shell/mobile-drawer';
import {
  NAV_GROUPS,
  PRIMARY_LINKS,
  findCurrentPage,
  isActive,
  overflowGroups,
} from '@/components/app-shell/navigation';
import { VARIANT_FONTS } from './fonts';
import { withVariant, type LayoutVariant } from './variant';
import './variants.css';

interface ShellProps {
  pathname: string;
  children: ReactNode;
}

const subscribeToNothing = () => () => {};
function useGreeting(): string {
  return useSyncExternalStore(
    subscribeToNothing,
    () => greetingFor(new Date()),
    () => 'Hello',
  );
}

function SignOutButton({ className, children }: { className: string; children: ReactNode }) {
  return (
    <form action={logoutAction}>
      <button type="submit" aria-label="Sign out" className={className}>
        {children}
      </button>
    </form>
  );
}

// A: Ledger ------------------------------------------------------------------------------------

/** A fixed sidebar with every page, a slim sticky header, the page edge to edge. */
function LedgerShell({ pathname, children }: ShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const current = findCurrentPage(pathname);
  const v: LayoutVariant = 'A';
  return (
    <div data-proto="A" className={`${VARIANT_FONTS.A} flex min-h-screen bg-paper text-ink`}>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-rule bg-surface lg:flex">
        <Link
          href={withVariant('/', v)}
          className="flex h-14 items-center gap-2.5 border-b border-rule px-5 font-semibold"
        >
          <span
            aria-hidden
            className="grid h-6 w-6 place-items-center bg-accent text-xs text-white"
          >
            FM
          </span>
          Finance Manager
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-2 pb-1.5 font-mono text-[11px] tracking-wide text-faint">
                {group.label}
              </p>
              {group.links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={withVariant(link.href, v)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 border-l-2 px-2 py-1.5 text-sm ${
                      active
                        ? 'border-accent bg-accent-tint font-medium text-accent-ink'
                        : 'border-transparent text-ink-soft hover:bg-sunken hover:text-ink'
                    }`}
                  >
                    <Icon name={link.icon} className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-rule p-3">
          <SignOutButton className="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm text-ink-soft hover:bg-sunken">
            <Icon name="signOut" className="h-4 w-4" /> Sign out
          </SignOutButton>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-surface/95 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setIsMenuOpen(true)}
            className="grid h-8 w-8 place-items-center border border-rule lg:hidden"
          >
            <Icon name="menu" className="h-4 w-4" />
          </button>
          {current && (
            <p className="flex items-center gap-2 font-mono text-xs text-muted">
              {current.group.label} <span aria-hidden>/</span>
              <span className="text-ink">{current.link.label}</span>
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Link
              href={withVariant('/accounts', v)}
              className="hidden border border-rule-strong bg-surface px-3 py-1.5 text-sm hover:bg-sunken sm:block"
            >
              Import statement
            </Link>
            <Link
              href={withVariant('/unclassified', v)}
              className="bg-ink px-3 py-1.5 text-sm text-white hover:bg-ink-hover"
            >
              Review unclassified
            </Link>
          </div>
        </header>
        <main className="px-4 py-6 md:px-6">{children}</main>
      </div>
      {isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}

// B: Command -----------------------------------------------------------------------------------

function CommandMore({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const groups = overflowGroups();
  const active = groups.some((g) => g.links.some((l) => isActive(pathname, l.href)));
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-14 items-center gap-1.5 border-b-2 px-1 text-sm ${
          active ? 'border-accent text-white' : 'border-transparent text-white/60 hover:text-white'
        }`}
      >
        More <span aria-hidden>▾</span>
      </button>
      {isOpen && (
        <div className="absolute top-14 left-0 z-40 grid w-[26rem] grid-cols-2 gap-3 rounded-lg border border-rule bg-surface p-3 text-ink shadow-2xl">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1 text-xs text-muted">{group.label}</p>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={withVariant(link.href, 'B')}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sunken"
                >
                  <Icon name={link.icon} className="h-4 w-4" /> {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One graphite bar: brand, tabs underlined in the accent, the actions; no hero, no greeting. */
function CommandShell({ pathname, children }: ShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const v: LayoutVariant = 'B';
  return (
    <div data-proto="B" className={`${VARIANT_FONTS.B} min-h-screen bg-paper text-ink`}>
      <header className="sticky top-0 z-30 bg-ink text-white">
        <div className="flex h-14 items-center gap-6 px-4 md:px-8">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setIsMenuOpen(true)}
            className="lg:hidden"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <Link
            href={withVariant('/', v)}
            className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight"
          >
            <span aria-hidden className="h-4 w-4 rotate-45 rounded-sm bg-accent" />
            Finance Manager
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
            {PRIMARY_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={withVariant(link.href, v)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-14 items-center border-b-2 px-1 text-sm ${
                    active
                      ? 'border-accent text-white'
                      : 'border-transparent text-white/60 hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <CommandMore pathname={pathname} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={withVariant('/accounts', v)}
              className="hidden rounded-md px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/20 hover:bg-white/10 md:block"
            >
              Import statement
            </Link>
            <Link
              href={withVariant('/unclassified', v)}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-ink"
            >
              Review unclassified
            </Link>
            <Link
              href={withVariant('/settings', v)}
              aria-label="Settings"
              className="hidden h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 md:grid"
            >
              <Icon name="settings" className="h-4 w-4" />
            </Link>
            <SignOutButton className="hidden h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 md:grid">
              <Icon name="signOut" className="h-4 w-4" />
            </SignOutButton>
          </div>
        </div>
      </header>
      <main className="px-4 py-8 md:px-8">{children}</main>
      {isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}

// C: Broadsheet --------------------------------------------------------------------------------

/** A newspaper masthead: date line, the title set large, every page in a ruled band. */
function BroadsheetShell({ pathname, children }: ShellProps) {
  const greeting = useGreeting();
  const v: LayoutVariant = 'C';
  const today = useSyncExternalStore(
    subscribeToNothing,
    () =>
      new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    () => '',
  );
  return (
    <div data-proto="C" className={`${VARIANT_FONTS.C} min-h-screen bg-paper text-ink`}>
      <header className="px-4 md:px-10">
        <div className="flex items-center justify-between border-b border-rule py-2 text-xs text-muted">
          <span>{today}</span>
          <span className="flex items-center gap-4">
            <Link href={withVariant('/accounts', v)} className="hover:text-ink">
              Import statement
            </Link>
            <Link href={withVariant('/settings', v)} className="hover:text-ink">
              Settings
            </Link>
            <SignOutButton className="hover:text-ink">Sign out</SignOutButton>
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 py-6">
          <Link
            href={withVariant('/', v)}
            className="font-display text-5xl font-semibold tracking-tight md:text-6xl"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
          >
            Finance Manager
          </Link>
          <p className="pb-2 font-serif text-xl text-ink-soft italic">
            {greeting}. Here is the state of the household.
          </p>
        </div>
        <nav
          aria-label="Main"
          className="flex flex-wrap items-center gap-x-6 gap-y-1 border-y-4 border-double border-ink py-2.5 text-sm"
        >
          {NAV_GROUPS.flatMap((group, gi) => [
            gi > 0 ? (
              <span key={`sep-${group.label}`} aria-hidden className="h-4 w-px bg-rule-strong" />
            ) : null,
            ...group.links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={withVariant(link.href, v)}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'font-semibold text-hero underline decoration-accent decoration-2 underline-offset-[6px]'
                      : 'text-ink-soft hover:text-ink'
                  }
                >
                  {link.label}
                </Link>
              );
            }),
          ])}
          <Link
            href={withVariant('/unclassified', v)}
            className="ml-auto bg-hero-deep px-3 py-1 text-sm text-white hover:bg-hero-mid"
          >
            Review unclassified →
          </Link>
        </nav>
      </header>
      <main className="px-4 py-8 md:px-10">{children}</main>
    </div>
  );
}

export function VariantShell({
  variant,
  pathname,
  children,
}: ShellProps & { variant: Exclude<LayoutVariant, 'current'> }) {
  if (variant === 'A') return <LedgerShell pathname={pathname}>{children}</LedgerShell>;
  if (variant === 'B') return <CommandShell pathname={pathname}>{children}</CommandShell>;
  return <BroadsheetShell pathname={pathname}>{children}</BroadsheetShell>;
}
