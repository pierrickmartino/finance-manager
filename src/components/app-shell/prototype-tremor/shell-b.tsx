'use client';
/**
 * PROTOTYPE (Tremor redesign) variant B, "Report tabs": a light masthead, every page as a
 * Tremor TabNavigation underline tab (scrolls sideways when narrow), and the page in a centred
 * reading column. The navy survives only as the brand mark. Throwaway.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RiLogoutBoxRLine, RiSettings3Line } from '@remixicon/react';
import { logoutAction } from '@/app/login/actions';
import { Button } from '@/components/tremor-prototype/Button';
import { TabNavigation, TabNavigationLink } from '@/components/tremor-prototype/TabNavigation';
import { NAV_GROUPS, isActive } from '../navigation';

const TABS = NAV_GROUPS.flatMap((g) => g.links).filter((l) => l.href !== '/settings');

export function ShellB({ pathname, children }: { pathname: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-5 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-lg bg-hero font-display text-sm text-on-hero"
            >
              fm
            </span>
            <span className="font-display text-lg text-ink">Finance Manager</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="light" asChild>
              <Link href="/unclassified">Review unclassified</Link>
            </Button>
            <Button variant="ghost" asChild aria-label="Settings">
              <Link href="/settings">
                <RiSettings3Line className="size-4" />
              </Link>
            </Button>
            <form action={logoutAction}>
              <Button variant="ghost" type="submit" aria-label="Sign out">
                <RiLogoutBoxRLine className="size-4" />
              </Button>
            </form>
          </div>
        </div>
        <div className="mx-auto mt-3 max-w-6xl px-2 md:px-4">
          <TabNavigation className="border-b-0">
            {TABS.map((link) => (
              <TabNavigationLink key={link.href} asChild active={isActive(pathname, link.href)}>
                <Link href={link.href}>{link.label}</Link>
              </TabNavigationLink>
            ))}
          </TabNavigation>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-6">{children}</main>
    </div>
  );
}
