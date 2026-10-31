'use client';
/*
 * PROTOTYPE — app-shell redesign, variant B: "Top bar + command palette".
 * No sidebar. Four primary destinations live in a frosted top bar; everything else is one
 * keystroke away in a ⌘K palette or a grouped "More" menu. A hero band names the current page.
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { ALL_LINKS, NAV_GROUPS, activeLink, isActive } from './nav';

export const NAME = 'Top bar + ⌘K';

const PRIMARY = ['/dashboards', '/transactions', '/reports', '/accounts'];

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const results = useMemo(
    () =>
      ALL_LINKS.filter((link) =>
        `${link.label} ${link.hint}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-zinc-950/40 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Go to"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          placeholder="Jump to…"
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, results.length - 1));
            if (event.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
            if (event.key === 'Enter' && results[index]) go(results[index].href);
            if (event.key === 'Escape') onClose();
          }}
          className="w-full border-b border-zinc-200 bg-transparent px-5 py-4 text-base outline-none dark:border-zinc-800"
        />
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.map((link, i) => (
            <li key={link.href}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(link.href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                  i === index
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : ''
                }`}
              >
                <Icon name={link.icon} />
                <span className="font-medium">{link.label}</span>
                <span className="ml-auto text-xs text-zinc-400">{link.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MoreMenu({ pathname }: { pathname: string }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
        More <span className="text-xs">▾</span>
      </summary>
      <div className="absolute top-full left-0 z-30 mt-2 grid w-[34rem] grid-cols-2 gap-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="p-2">
            <p className="pb-1 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              {group.label}
            </p>
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-start gap-3 rounded-lg p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  isActive(pathname, link.href) ? 'text-indigo-600 dark:text-indigo-400' : ''
                }`}
              >
                <Icon name={link.icon} className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="block text-sm font-medium">{link.label}</span>
                  <span className="block text-xs text-zinc-500">{link.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

export function VariantB({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = activeLink(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/70 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-6">
          <Link href="/" className="mr-4 flex items-center gap-2 font-semibold tracking-tight">
            <span className="h-6 w-6 rounded-md bg-gradient-to-tr from-indigo-600 via-violet-500 to-fuchsia-500" />
            Finance
          </Link>
          <nav className="flex items-center gap-1">
            {ALL_LINKS.filter((link) => PRIMARY.includes(link.href)).map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <MoreMenu pathname={pathname} />
          </nav>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex w-56 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
          >
            Search or jump to…
            <kbd className="ml-auto rounded border border-zinc-200 px-1.5 text-[10px] dark:border-zinc-700">
              ⌘K
            </kbd>
          </button>
          <Link
            href="/unclassified"
            className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
          >
            To classify
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sign out"
              className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            >
              ⏻<span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </header>

      <div className="border-b border-zinc-100 bg-gradient-to-b from-indigo-50/60 to-transparent dark:border-zinc-900 dark:from-indigo-500/5">
        <div className="mx-auto max-w-7xl px-6 pt-8 pb-6">
          <p className="text-xs font-medium tracking-wider text-indigo-600 uppercase dark:text-indigo-400">
            {current?.hint ?? 'Welcome back'}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{current?.label ?? 'Home'}</p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
