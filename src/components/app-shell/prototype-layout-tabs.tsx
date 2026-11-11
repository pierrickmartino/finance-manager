'use client';

/**
 * PROTOTYPE — throwaway. Variant D, "Two-tier tabs": a dense, all-horizontal shell in the
 * current ink-and-vermilion look. The top tier names the four groups; the second tier lists the
 * current group's pages. The page gets the full width under them, with no hero and no sidebar.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { NAV_GROUPS, findCurrentPage, isActive } from './navigation';

export function TabsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentGroup = findCurrentPage(pathname)?.group ?? NAV_GROUPS[0]!;

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20">
        <div className="bg-ink text-paper">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 overflow-x-auto px-4 md:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-lg">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              Finance Manager
            </Link>
            <nav aria-label="Sections" className="flex h-full items-stretch gap-1">
              {NAV_GROUPS.map((group) => {
                const active = group === currentGroup;
                return (
                  <Link
                    key={group.label}
                    href={group.links[0]?.href ?? '/'}
                    aria-current={active ? 'true' : undefined}
                    className={`relative flex items-center px-3 text-sm ${active ? 'text-paper after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent' : 'text-paper/60 hover:text-paper'}`}
                  >
                    {group.label}
                  </Link>
                );
              })}
            </nav>
            <form action={logoutAction} className="ml-auto shrink-0">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-paper/70 hover:bg-white/10 hover:text-paper"
              >
                <Icon name="signOut" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
        <div className="border-b border-rule bg-surface/90 backdrop-blur">
          <nav
            aria-label={currentGroup.label}
            className="mx-auto flex h-12 max-w-7xl items-center gap-1 overflow-x-auto px-4 md:px-6"
          >
            {currentGroup.links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm ${active ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`}
                >
                  <Icon name={link.icon} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-8 pb-28 md:px-6">{children}</main>
    </div>
  );
}
