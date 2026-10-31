'use client';
/*
 * PROTOTYPE — app-shell redesign, variant A: "Grouped sidebar".
 * A persistent left sidebar groups the 12 destinations into Overview / Money / Organize / System.
 * A slim sticky top bar carries the breadcrumb. Content sits on a soft tinted canvas.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { NAV_GROUPS, activeGroup, activeLink, isActive } from './nav';

export const NAME = 'Grouped sidebar';

export function VariantA({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const group = activeGroup(pathname);
  const link = activeLink(pathname);

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-sm">
            F
          </span>
          <span className="font-semibold tracking-tight">Finance Manager</span>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((navGroup) => (
            <div key={navGroup.label} className="mt-5 first:mt-1">
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                {navGroup.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {navGroup.links.map((navLink) => {
                  const active = isActive(pathname, navLink.href);
                  return (
                    <li key={navLink.href}>
                      <Link
                        href={navLink.href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          active
                            ? 'bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                        }`}
                      >
                        <Icon name={navLink.icon} />
                        {navLink.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <form action={logoutAction} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-200 text-xs font-semibold dark:bg-zinc-700">
              Me
            </span>
            Sign out
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-zinc-200 bg-white/80 px-6 text-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
          <span className="text-zinc-400">{group.label}</span>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="font-medium">{link?.label ?? 'Home'}</span>
        </header>
        <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
