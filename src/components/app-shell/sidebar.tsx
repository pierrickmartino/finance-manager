'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { NAV_GROUPS, isActive } from './navigation';

const LINK_BASE = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
const LINK_ACTIVE = 'bg-accent-tint font-medium text-accent-ink';
const LINK_IDLE = 'text-ink-soft hover:bg-sunken hover:text-ink';
/** Icons keep their size when the rail narrows a link to 40px. */
const ICON = 'h-4 w-4 shrink-0';
/** Text the rail hides: faded rather than removed, so it stays in the accessibility tree. */
const FADE = 'whitespace-nowrap motion-safe:transition-opacity motion-safe:duration-200';
const GROUP_LABEL = 'px-3 pb-1.5 text-xs font-medium';
/** On the rail a group's label gives way to a short hairline, at the label's own height. */
const GROUP_DIVIDER =
  'after:absolute after:top-1/2 after:left-2 after:h-px after:w-6 after:bg-rule';

export function Brand({ isNameHidden = false }: { isNameHidden?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink pb-0.5 font-display text-lg text-paper shadow-sm after:absolute after:right-2 after:bottom-1.5 after:left-2 after:h-0.5 after:rounded-full after:bg-accent"
      >
        F
      </span>
      <span
        className={`font-display text-xl tracking-tight ${FADE} ${isNameHidden ? 'opacity-0' : ''}`}
      >
        Finance Manager
      </span>
    </Link>
  );
}

interface SidebarProps {
  /** Called after a link is followed (the mobile drawer and the peek close themselves with it). */
  onNavigate?: () => void;
  /**
   * Icons only, for the collapsed desktop rail (the sidebar's left 64px). Nothing moves between
   * the two: the labels fade, so an icon stays under the pointer when the rail peeks open.
   */
  isRail?: boolean;
  /** A control beside the brand (the desktop sidebar's pin). Not shown on the rail. */
  headerAction?: ReactNode;
}

/** Brand, grouped navigation and sign-out: the content of the desktop sidebar and mobile drawer. */
export function Sidebar({ onNavigate, isRail = false, headerAction }: SidebarProps) {
  const pathname = usePathname();
  const hidden = isRail ? 'opacity-0' : '';
  const width = isRail ? 'w-10' : 'w-full';

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center justify-between px-4">
        <Brand isNameHidden={isRail} />
        {!isRail && headerAction}
      </div>
      <nav aria-label="Main" className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group, index) => {
          const labelId = `nav-group-${group.label.toLowerCase()}`;
          const divider = isRail && index > 0 ? GROUP_DIVIDER : '';
          return (
            <div key={group.label} className="mt-5 first:mt-1">
              <p id={labelId} className={`relative ${divider}`}>
                <span className={`block ${GROUP_LABEL} text-muted ${FADE} ${hidden}`}>
                  {group.label}
                </span>
              </p>
              <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
                {group.links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={`${LINK_BASE} ${width} ${active ? LINK_ACTIVE : LINK_IDLE}`}
                      >
                        <Icon name={link.icon} className={ICON} />
                        <span className={`${FADE} ${hidden}`}>{link.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <form action={logoutAction} className="border-t border-rule p-3">
        <button type="submit" className={`${LINK_BASE} ${LINK_IDLE} ${width}`}>
          <Icon name="signOut" className={ICON} />
          <span className={`${FADE} ${hidden}`}>Sign out</span>
        </button>
      </form>
    </div>
  );
}
