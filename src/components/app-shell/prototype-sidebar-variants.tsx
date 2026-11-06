'use client';

/**
 * PROTOTYPE — throwaway, do not merge to main.
 *
 * Question: how should the desktop sidebar collapse/expand?
 * Four variants in the real app shell (every page), switchable via `?variant=` and the floating
 * bar (← / → keys). The mobile drawer is untouched. Collapse state lives in memory only: it
 * survives navigation (the shell stays mounted) but not a reload.
 *
 * - A  Icon rail       — chevron in the sidebar header shrinks it to a 64px icon rail.
 * - B  Hide entirely   — a panel button in the top bar slides the sidebar away; `[` toggles.
 * - C  Peek + pin      — a rail by default; hovering (or tabbing in) peeks the full menu over the
 *                        page; the pin keeps it open and pushes the page.
 * - D  Group accordion — the sidebar keeps its width; each group (Overview, Money…) folds.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { NAV_GROUPS, isActive, type NavLink } from './navigation';
import { Brand, Sidebar } from './sidebar';

export const SIDEBAR_VARIANTS = [
  { key: 'A', name: 'Icon rail' },
  { key: 'B', name: 'Hide entirely' },
  { key: 'C', name: 'Peek + pin' },
  { key: 'D', name: 'Group accordion' },
  { key: 'current', name: 'Today, no collapse' },
];

const EXTRA_PATHS = {
  chevronsLeft: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  chevronsRight: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  chevronDown: 'M6 9l6 6 6-6',
  panelLeft: 'M3 4h18v16H3zM9 4v16',
  pin: 'M12 16v6M8 3h8l-1.5 6L18 12v4H6v-4l3.5-3z',
} as const;

function ExtraIcon({
  name,
  className = 'h-4 w-4',
}: {
  name: keyof typeof EXTRA_PATHS;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={EXTRA_PATHS[name]} />
    </svg>
  );
}

const ASIDE =
  'sticky top-0 hidden h-screen shrink-0 border-r border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900';
const LINK_BASE = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
const LINK_ACTIVE =
  'bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
const LINK_IDLE =
  'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';
const TOGGLE =
  'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

function BrandMark() {
  return (
    <Link
      href="/"
      aria-label="Finance Manager"
      className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-sm"
    >
      F
    </Link>
  );
}

/** Icon-only link with a hover/focus label to its right. */
function RailLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-label={link.label}
      aria-current={active ? 'page' : undefined}
      className={`group relative grid h-9 w-10 place-items-center rounded-lg transition-colors ${active ? LINK_ACTIVE : LINK_IDLE}`}
    >
      <Icon name={link.icon} />
      <span className="pointer-events-none absolute left-full z-40 ml-3 rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-zinc-100 dark:text-zinc-900">
        {link.label}
      </span>
    </Link>
  );
}

function FullLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? 'page' : undefined}
      className={`${LINK_BASE} ${active ? LINK_ACTIVE : LINK_IDLE}`}
    >
      <Icon name={link.icon} />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

/** The grouped list, full (labels) or as a rail (icons, groups separated by a hairline). */
function NavList({ rail }: { rail: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className={`flex-1 px-3 pb-4 ${rail ? 'flex flex-col items-center overflow-visible' : 'overflow-y-auto'}`}
    >
      {NAV_GROUPS.map((group, index) => {
        const labelId = `nav-group-${group.label.toLowerCase()}`;
        return (
          <div key={group.label} className={rail ? 'mt-3 first:mt-1' : 'mt-5 first:mt-1'}>
            {rail ? (
              <p id={labelId} className="sr-only">
                {group.label}
              </p>
            ) : (
              <p
                id={labelId}
                className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-zinc-400 uppercase"
              >
                {group.label}
              </p>
            )}
            {rail && index > 0 && (
              <div
                aria-hidden="true"
                className="mx-auto mb-3 h-px w-6 bg-zinc-200 dark:bg-zinc-800"
              />
            )}
            <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  {rail ? (
                    <RailLink link={link} active={isActive(pathname, link.href)} />
                  ) : (
                    <FullLink link={link} active={isActive(pathname, link.href)} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SignOut({ rail }: { rail: boolean }) {
  return (
    <form action={logoutAction} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
      <button
        type="submit"
        aria-label={rail ? 'Sign out' : undefined}
        title={rail ? 'Sign out' : undefined}
        className={
          rail
            ? `mx-auto grid h-9 w-10 place-items-center rounded-lg ${LINK_IDLE}`
            : `${LINK_BASE} ${LINK_IDLE} w-full`
        }
      >
        <Icon name="signOut" />
        {!rail && 'Sign out'}
      </button>
    </form>
  );
}

interface CollapseProps {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
}

/* ── A: Icon rail ─────────────────────────────────────────────────────────────────────────── */

function VariantA({ collapsed, setCollapsed }: CollapseProps) {
  return (
    <aside className={`${ASIDE} transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className="flex h-full flex-col">
        <div
          className={`flex items-center py-5 ${collapsed ? 'flex-col gap-3 px-0' : 'justify-between px-5'}`}
        >
          {collapsed ? <BrandMark /> : <Brand />}
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
            className={TOGGLE}
          >
            <ExtraIcon name={collapsed ? 'chevronsRight' : 'chevronsLeft'} />
          </button>
        </div>
        <NavList rail={collapsed} />
        <SignOut rail={collapsed} />
      </div>
    </aside>
  );
}

/* ── B: Hide entirely, toggled from the top bar ──────────────────────────────────────────── */

function VariantB({ collapsed, setCollapsed }: CollapseProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === '[') setCollapsed(!collapsed);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, setCollapsed]);

  return (
    <aside
      aria-hidden={collapsed}
      inert={collapsed}
      className={`${ASIDE} overflow-hidden transition-[width,border-color] duration-200 ${collapsed ? 'w-0 border-transparent' : 'w-64'}`}
    >
      <div className="w-64">
        <Sidebar />
      </div>
    </aside>
  );
}

/** Variant B's toggle, rendered at the left of the top bar on desktop. */
export function VariantBTopBarToggle({ collapsed, setCollapsed }: CollapseProps) {
  return (
    <div className="hidden items-center gap-3 md:flex">
      <button
        type="button"
        aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-expanded={!collapsed}
        title={`${collapsed ? 'Show' : 'Hide'} sidebar  [`}
        onClick={() => setCollapsed(!collapsed)}
        className={TOGGLE}
      >
        <ExtraIcon name="panelLeft" />
      </button>
      {collapsed && <Brand />}
      <span aria-hidden="true" className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

/* ── C: Rail that peeks on hover, pin to keep it open ────────────────────────────────────── */

const PEEK_DELAY_MS = 150;

function VariantC({ collapsed, setCollapsed }: CollapseProps) {
  const [isPeeking, setIsPeeking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinned = !collapsed;
  const isOpen = isPinned || isPeeking;

  function startPeek() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIsPeeking(true), PEEK_DELAY_MS);
  }
  function endPeek() {
    if (timer.current) clearTimeout(timer.current);
    setIsPeeking(false);
  }

  return (
    <aside
      className={`${ASIDE} z-30 overflow-visible transition-[width] duration-200 ${isPinned ? 'w-64' : 'w-16'}`}
    >
      <div
        onMouseEnter={startPeek}
        onMouseLeave={endPeek}
        onFocus={() => setIsPeeking(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) endPeek();
        }}
        className={`absolute inset-y-0 left-0 flex flex-col border-r bg-white transition-[width,box-shadow] duration-200 dark:bg-zinc-900 ${isOpen ? 'w-64' : 'w-16'} ${isPeeking && !isPinned ? 'border-zinc-200 shadow-2xl dark:border-zinc-800' : 'border-transparent'}`}
      >
        <div
          className={`flex items-center py-5 ${isOpen ? 'justify-between px-5' : 'justify-center'}`}
        >
          {isOpen ? <Brand /> : <BrandMark />}
          {isOpen && (
            <button
              type="button"
              aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              aria-pressed={isPinned}
              title={isPinned ? 'Unpin (collapse to rail)' : 'Pin open'}
              onClick={() => {
                setCollapsed(isPinned);
                setIsPeeking(false);
              }}
              className={`${TOGGLE} ${isPinned ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
            >
              <ExtraIcon name="pin" />
            </button>
          )}
        </div>
        <NavList rail={!isOpen} />
        <SignOut rail={!isOpen} />
      </div>
    </aside>
  );
}

/* ── D: Group accordion ──────────────────────────────────────────────────────────────────── */

function VariantD() {
  const pathname = usePathname();
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const allFolded = NAV_GROUPS.every((group) => folded[group.label]);

  return (
    <aside className={`${ASIDE} w-64`}>
      <div className="flex h-full flex-col">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <div className="flex justify-end px-5 pb-1">
          <button
            type="button"
            onClick={() =>
              setFolded(Object.fromEntries(NAV_GROUPS.map((group) => [group.label, !allFolded])))
            }
            className="text-[11px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            {allFolded ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => {
            const labelId = `nav-group-${group.label.toLowerCase()}`;
            const isFolded = folded[group.label] ?? false;
            // A folded group still shows the page you're on, so you never lose your place.
            const visible = isFolded
              ? group.links.filter((link) => isActive(pathname, link.href))
              : group.links;
            return (
              <div key={group.label} className="mt-3 first:mt-0">
                <button
                  type="button"
                  id={labelId}
                  aria-expanded={!isFolded}
                  onClick={() => setFolded({ ...folded, [group.label]: !isFolded })}
                  className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase hover:bg-zinc-50 hover:text-zinc-600 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-300"
                >
                  <span>
                    {group.label}
                    {isFolded && (
                      <span className="ml-1.5 font-normal tracking-normal normal-case">
                        · {group.links.length}
                      </span>
                    )}
                  </span>
                  <ExtraIcon
                    name="chevronDown"
                    className={`h-3.5 w-3.5 transition-transform ${isFolded ? '-rotate-90' : ''}`}
                  />
                </button>
                <ul aria-labelledby={labelId} className="mt-0.5 flex flex-col gap-0.5">
                  {visible.map((link) => (
                    <li key={link.href}>
                      <FullLink link={link} active={isActive(pathname, link.href)} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <SignOut rail={false} />
      </div>
    </aside>
  );
}

/* ── Switch ─────────────────────────────────────────────────────────────────────────────── */

export function PrototypeDesktopSidebar({
  variant,
  ...collapse
}: CollapseProps & { variant: string }) {
  if (variant === 'A') return <VariantA {...collapse} />;
  if (variant === 'B') return <VariantB {...collapse} />;
  if (variant === 'C') return <VariantC {...collapse} />;
  if (variant === 'D') return <VariantD />;
  return (
    <aside className={`${ASIDE} w-64`}>
      <Sidebar />
    </aside>
  );
}
