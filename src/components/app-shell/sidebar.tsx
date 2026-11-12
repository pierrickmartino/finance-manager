'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { NAV_GROUPS, isActive } from './navigation';

const LINK_BASE = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
const LINK_ACTIVE = 'bg-accent-tint font-medium text-accent-ink';
const LINK_IDLE = 'text-ink-soft hover:bg-sunken hover:text-ink';
const ICON = 'h-4 w-4 shrink-0';
const GROUP_LABEL = 'px-3 pb-1.5 text-xs font-medium text-muted';

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink pb-0.5 font-display text-lg text-paper shadow-sm after:absolute after:right-2 after:bottom-1.5 after:left-2 after:h-0.5 after:rounded-full after:bg-accent"
      >
        F
      </span>
      <span className="font-display text-xl tracking-tight">Finance Manager</span>
    </Link>
  );
}

interface SidebarProps {
  /** Called after a link is followed, so the drawer closes itself. */
  onNavigate?: () => void;
}

/** Brand, every page in its group, and sign-out: the drawer below `lg`. */
export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center justify-between px-4">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const labelId = `nav-group-${group.label.toLowerCase()}`;
          return (
            <div key={group.label} className="mt-5 first:mt-1">
              <p id={labelId} className={GROUP_LABEL}>
                {group.label}
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
                        className={`${LINK_BASE} ${active ? LINK_ACTIVE : LINK_IDLE}`}
                      >
                        <Icon name={link.icon} className={ICON} />
                        {link.label}
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
        <button type="submit" className={`${LINK_BASE} ${LINK_IDLE} w-full`}>
          <Icon name="signOut" className={ICON} />
          Sign out
        </button>
      </form>
    </div>
  );
}
