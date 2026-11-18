'use client';
/**
 * PROTOTYPE (Tremor redesign) variant C, "Icon rail + inspector": a narrow navy icon rail
 * (labels in Tremor tooltips), a slim command bar with search, and the page full bleed so it
 * can split into a main column and a right-hand inspector. Dense, tool-like. Throwaway.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { RiSearchLine } from '@remixicon/react';
import { logoutAction } from '@/app/login/actions';
import { Tooltip } from '@/components/tremor-prototype/Tooltip';
import { cx } from '@/components/tremor-prototype/cx';
import { Icon } from '../icon';
import { NAV_GROUPS, findCurrentPage, isActive } from '../navigation';

export function ShellC({ pathname, children }: { pathname: string; children: ReactNode }) {
  const router = useRouter();
  const current = findCurrentPage(pathname);
  return (
    <div className="min-h-screen bg-sunken">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-14 flex-col items-center gap-1 bg-hero-deep py-3 text-on-hero">
        <Link href="/" aria-label="Finance Manager" className="mb-3 grid size-9 place-items-center">
          <span aria-hidden="true" className="size-3 rounded-full bg-accent" />
        </Link>
        {NAV_GROUPS.map((group, gi) => (
          <div
            key={group.label}
            className={cx(
              'flex flex-col items-center gap-1',
              gi > 0 && 'mt-2 border-t border-on-hero/15 pt-3',
            )}
          >
            {group.links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Tooltip
                  key={link.href}
                  content={link.label}
                  side="right"
                  showArrow={false}
                  asChild
                >
                  <Link
                    href={link.href}
                    aria-label={link.label}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'grid size-9 place-items-center rounded-md transition-colors',
                      active
                        ? 'bg-on-hero text-hero'
                        : 'text-on-hero/70 hover:bg-on-hero/10 hover:text-on-hero',
                    )}
                  >
                    <Icon name={link.icon} className="size-[18px]" />
                  </Link>
                </Tooltip>
              );
            })}
          </div>
        ))}
        <form action={logoutAction} className="mt-auto">
          <Tooltip content="Sign out" side="right" showArrow={false} asChild>
            <button
              type="submit"
              aria-label="Sign out"
              className="grid size-9 place-items-center rounded-md text-on-hero/70 hover:bg-on-hero/10"
            >
              <Icon name="signOut" className="size-[18px]" />
            </button>
          </Tooltip>
        </form>
      </aside>
      <div className="pl-14">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-rule bg-surface px-4">
          <p className="text-sm font-semibold text-ink">
            {current?.link.label ?? 'Finance Manager'}
          </p>
          <form
            role="search"
            className="relative ml-auto w-full max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              const q = new FormData(event.currentTarget).get('q');
              router.push(`/transactions?q=${encodeURIComponent(String(q ?? ''))}`);
            }}
          >
            <RiSearchLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
            <input
              name="q"
              type="search"
              placeholder="Search transactions, payees…"
              className="w-full rounded-md border border-rule-strong bg-paper py-1.5 pr-3 pl-8 text-sm placeholder:text-faint"
            />
          </form>
          <Link
            href="/unclassified"
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink-hover"
          >
            Review
          </Link>
        </header>
        <main className="p-3 md:p-4">{children}</main>
      </div>
    </div>
  );
}
