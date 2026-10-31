'use client';
/*
 * PROTOTYPE — app-shell redesign, variant C: "Icon rail + section panel".
 * A dark icon rail picks one of four sections; a second panel lists that section's pages with
 * descriptions. The page itself floats as an inset sheet, like a document on a desk.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { NAV_GROUPS, activeGroup, isActive } from './nav';

export const NAME = 'Icon rail + panel';

export function VariantC({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeGroup = activeGroup(pathname);
  // Hovering/clicking a rail icon previews that section without navigating.
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const group = NAV_GROUPS.find((g) => g.label === pickedLabel) ?? routeGroup;

  return (
    <div className="flex min-h-screen bg-stone-200/70 dark:bg-black">
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col items-center gap-2 bg-zinc-950 py-4 text-zinc-400">
        <Link
          href="/"
          className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-white text-sm font-black text-zinc-950"
        >
          fm
        </Link>
        {NAV_GROUPS.map((navGroup) => {
          const selected = navGroup.label === group.label;
          return (
            <button
              key={navGroup.label}
              type="button"
              title={navGroup.label}
              onClick={() => setPickedLabel(navGroup.label)}
              className={`group relative grid h-10 w-10 place-items-center rounded-xl transition-colors ${
                selected ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              {navGroup.label === routeGroup.label && (
                <span className="absolute -left-3 h-5 w-1 rounded-r bg-lime-400" />
              )}
              <Icon name={navGroup.icon} className="h-5 w-5" />
              <span className="sr-only">{navGroup.label}</span>
            </button>
          );
        })}
        <form action={logoutAction} className="mt-auto">
          <button
            type="submit"
            title="Sign out"
            className="grid h-10 w-10 place-items-center rounded-full bg-lime-400 text-xs font-bold text-zinc-950"
          >
            ⏻<span className="sr-only">Sign out</span>
          </button>
        </form>
      </aside>

      <nav
        aria-label={group.label}
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col px-3 py-5 lg:flex"
      >
        <p className="px-3 pb-4 text-xl font-semibold tracking-tight">{group.label}</p>
        <ul className="flex flex-col gap-1">
          {group.links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setPickedLabel(null)}
                  aria-current={active ? 'page' : undefined}
                  className={`block rounded-xl px-3 py-2.5 transition-colors ${
                    active
                      ? 'bg-white shadow-sm dark:bg-zinc-900'
                      : 'hover:bg-white/60 dark:hover:bg-zinc-900/60'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon name={link.icon} />
                    {link.label}
                  </span>
                  <span className="mt-0.5 block pl-6 text-xs text-zinc-500">{link.hint}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 p-2 lg:pl-0">
        <main className="min-h-[calc(100vh-1rem)] rounded-2xl bg-white px-8 py-8 shadow-sm ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
