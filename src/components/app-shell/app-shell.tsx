'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './icon';
import { findCurrentPage } from './navigation';
import { Brand, Sidebar } from './sidebar';

const ICON_BUTTON =
  'grid h-9 w-9 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800';

/** "Money / Transactions" for the current page; nothing for pages outside the sidebar. */
function Breadcrumb() {
  const current = findCurrentPage(usePathname());
  if (!current) return null;
  return (
    <p data-testid="breadcrumb" className="flex items-center gap-2 text-sm">
      <span className="text-zinc-400">{current.group.label}</span>
      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
        /
      </span>
      <span className="font-medium">{current.link.label}</span>
    </p>
  );
}

/** Below `md` the sidebar becomes a drawer opened from the top bar. */
function MobileDrawer({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 md:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl dark:bg-zinc-900"
      >
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  );
}

interface AppShellProps {
  /** Signed out (login, setup), only the page renders: no sidebar, top bar or drawer. */
  showNavigation: boolean;
  children: ReactNode;
}

/**
 * The page layout: a grouped sidebar, a sticky breadcrumb bar and the page on a soft canvas.
 *
 * `children` keeps the same position in the tree whether or not the navigation shows, so a page
 * whose action signs the user in (first-run setup shows its recovery codes afterwards) is not
 * remounted, and loses no state, when the navigation appears.
 */
export function AppShell({ showNavigation, children }: AppShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {showNavigation && (
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
          <Sidebar />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {showNavigation && (
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/80 px-4 backdrop-blur md:px-6 dark:border-zinc-800 dark:bg-zinc-900/80">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen(true)}
              className={`${ICON_BUTTON} md:hidden`}
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <div className="md:hidden">
              <Brand />
            </div>
            <div className="hidden md:block">
              <Breadcrumb />
            </div>
          </header>
        )}
        <main
          className={`mx-auto w-full px-4 py-8 md:px-6 ${showNavigation ? 'max-w-6xl' : 'max-w-5xl'}`}
        >
          {children}
        </main>
      </div>

      {showNavigation && isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}
