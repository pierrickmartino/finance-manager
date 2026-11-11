'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { DesktopSidebar } from './desktop-sidebar';
import { Icon } from './icon';
import { MobileDrawer } from './mobile-drawer';
import { findCurrentPage } from './navigation';
import { DockLayout } from './prototype-layout-dock';
import { HeroLayout } from './prototype-layout-hero';
import { PrototypeLayoutSwitcher } from './prototype-layout-switcher';
import { TabsLayout } from './prototype-layout-tabs';
import {
  IS_PROTOTYPE_ENABLED,
  PROTOTYPE_LAYOUT_PARAM,
  parsePrototypeLayout,
  type PrototypeLayoutKey,
} from './prototype-layouts';
import { Brand } from './sidebar';
import type { SidebarMode } from './sidebar-mode';

const ICON_BUTTON = 'grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-sunken';

/** "Money / Transactions" for the current page; nothing for pages outside the sidebar. */
function Breadcrumb() {
  const current = findCurrentPage(usePathname());
  if (!current) return null;
  return (
    <p data-testid="breadcrumb" className="flex items-center gap-2 text-sm">
      <span className="text-faint">{current.group.label}</span>
      <span aria-hidden="true" className="text-faint">
        /
      </span>
      <span className="font-medium">{current.link.label}</span>
    </p>
  );
}

interface AppShellProps {
  /** Signed out (login, setup), only the page renders: no sidebar, top bar or drawer. */
  showNavigation: boolean;
  /** The desktop sidebar's saved mode: pinned open, or a rail of icons. */
  sidebarMode: SidebarMode;
  /** PROTOTYPE: the layout variant saved in the prototype cookie, if any. */
  prototypeLayout?: string;
  children: ReactNode;
}

/**
 * The page layout: a grouped sidebar, a sticky breadcrumb bar and the page on a soft canvas.
 *
 * `children` keeps the same position in the tree whether or not the navigation shows, so a page
 * whose action signs the user in (first-run setup shows its recovery codes afterwards) is not
 * remounted, and loses no state, when the navigation appears.
 */
export function AppShell(props: AppShellProps) {
  // PROTOTYPE: pick a layout variant (?layout=A|B|C|D, remembered in a cookie). Delete after.
  const searchParams = useSearchParams();
  const [saved, setSaved] = useState<PrototypeLayoutKey | null>(
    parsePrototypeLayout(props.prototypeLayout),
  );
  const layout =
    parsePrototypeLayout(searchParams.get(PROTOTYPE_LAYOUT_PARAM)) ??
    saved ??
    (IS_PROTOTYPE_ENABLED ? 'A' : null);
  if (!props.showNavigation || layout === null) return <CurrentShell {...props} />;

  return (
    <>
      {layout === 'A' && <CurrentShell {...props} />}
      {layout === 'B' && <HeroLayout>{props.children}</HeroLayout>}
      {layout === 'C' && <DockLayout>{props.children}</DockLayout>}
      {layout === 'D' && <TabsLayout>{props.children}</TabsLayout>}
      <PrototypeLayoutSwitcher current={layout} onChange={setSaved} />
    </>
  );
}

function CurrentShell({ showNavigation, sidebarMode, children }: AppShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-paper">
      {showNavigation && <DesktopSidebar initialMode={sidebarMode} />}

      <div className="flex min-w-0 flex-1 flex-col">
        {showNavigation && (
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-surface/80 px-4 backdrop-blur md:px-6">
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
