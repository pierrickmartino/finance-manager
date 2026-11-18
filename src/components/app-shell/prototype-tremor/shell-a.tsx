'use client';
/**
 * PROTOTYPE (Tremor redesign) variant A, "Sidebar workspace": a fixed navy sidebar with every
 * page grouped, a light header with the breadcrumb and the quick actions, and the page on paper.
 * No hero band: the navy moves into the sidebar. Throwaway.
 */
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { RiAddLine, RiInbox2Line, RiMenuLine, RiSearchLine } from '@remixicon/react';
import { logoutAction } from '@/app/login/actions';
import { Button } from '@/components/tremor-prototype/Button';
import { Divider } from '@/components/tremor-prototype/Divider';
import { cx } from '@/components/tremor-prototype/cx';
import { Icon } from '../icon';
import { MobileDrawer } from '../mobile-drawer';
import { NAV_GROUPS, findCurrentPage, isActive } from '../navigation';

export function ShellA({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const current = findCurrentPage(pathname);
  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-hero-deep text-on-hero lg:flex">
        <Link href="/" className="flex h-16 items-center gap-2 px-6 font-display text-xl">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
          Finance Manager
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mt-5">
              <p className="px-3 text-xs font-medium text-on-hero/50">{group.label}</p>
              <ul className="mt-1 space-y-0.5">
                {group.links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-on-hero/12 font-medium text-on-hero'
                            : 'text-on-hero/70 hover:bg-on-hero/5 hover:text-on-hero',
                        )}
                      >
                        <Icon name={link.icon} className="size-4" />
                        {link.label}
                        {active && (
                          <span
                            aria-hidden="true"
                            className="ml-auto size-1.5 rounded-full bg-accent"
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-on-hero/10 p-3">
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-on-hero/70 hover:bg-on-hero/5 hover:text-on-hero"
            >
              <Icon name="signOut" className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-rule bg-surface/90 px-4 backdrop-blur md:px-8">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-ink-soft hover:bg-sunken lg:hidden"
          >
            <RiMenuLine className="size-5" />
          </button>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <span className="text-muted">{current?.group.label ?? 'Finance Manager'}</span>
            {current && (
              <>
                <span aria-hidden="true" className="text-faint">
                  /
                </span>
                <span className="font-medium text-ink">{current.link.label}</span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/transactions"
              className="hidden items-center gap-2 rounded-md border border-rule-strong px-3 py-1.5 text-sm text-muted hover:bg-sunken md:flex"
            >
              <RiSearchLine className="size-4" />
              Search transactions
            </Link>
            <Divider className="mx-1 hidden h-6 w-px md:block" />
            <Button variant="secondary" asChild>
              <Link href="/accounts">
                <RiAddLine className="-ml-1 mr-1.5 size-4" />
                Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/unclassified">
                <RiInbox2Line className="-ml-1 mr-1.5 size-4" />
                Review unclassified
              </Link>
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">{children}</main>
      </div>
      {open && <MobileDrawer onClose={() => setOpen(false)} />}
    </div>
  );
}
