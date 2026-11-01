'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { NAV_GROUPS, isActive } from './navigation';

const LINK_BASE = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
const LINK_ACTIVE =
  'bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
const LINK_IDLE =
  'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-sm"
      >
        F
      </span>
      <span className="font-semibold tracking-tight">Finance Manager</span>
    </Link>
  );
}

interface SidebarProps {
  /** Called after a link is followed (the mobile drawer closes itself with it). */
  onNavigate?: () => void;
}

/** Brand, grouped navigation and sign-out: the content of the desktop sidebar and mobile drawer. */
export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const labelId = `nav-group-${group.label.toLowerCase()}`;
          return (
            <div key={group.label} className="mt-5 first:mt-1">
              <p
                id={labelId}
                className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase"
              >
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
                        <Icon name={link.icon} />
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
      <form action={logoutAction} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <button type="submit" className={`${LINK_BASE} ${LINK_IDLE} w-full`}>
          <Icon name="signOut" />
          Sign out
        </button>
      </form>
    </div>
  );
}
