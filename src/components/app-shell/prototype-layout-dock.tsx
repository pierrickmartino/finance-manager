'use client';

/**
 * PROTOTYPE — throwaway. Variant C, "Floating dock": no sidebar and no top bar. A floating
 * glass column of icons on the left (labels on hover), a soft teal wash behind the page, and a
 * slim context line with the greeting and a "Jump to" box that replaces browsing a menu.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { Icon } from './icon';
import { MobileDrawer } from './mobile-drawer';
import { NAV_GROUPS, findCurrentPage, isActive } from './navigation';
import { greeting } from './prototype-layouts';

const ALL_LINKS = NAV_GROUPS.flatMap((group) => group.links);
const DOCK_ITEM = 'group relative grid h-11 w-11 place-items-center rounded-2xl transition-colors';

function DockLink({
  href,
  label,
  children,
  active,
}: {
  href: string;
  label: string;
  children: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`${DOCK_ITEM} ${active ? 'bg-[#0f4352] text-white shadow-lg' : 'text-ink-soft hover:bg-white hover:text-ink'}`}
    >
      {children}
      <span className="pointer-events-none absolute left-14 rounded-lg bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </Link>
  );
}

function JumpTo() {
  const router = useRouter();
  const [value, setValue] = useState('');
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const target = ALL_LINKS.find((link) => link.label.toLowerCase() === value.toLowerCase());
        if (target) router.push(target.href);
        setValue('');
      }}
      className="hidden items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm shadow-sm ring-1 ring-rule backdrop-blur sm:flex"
    >
      <Icon name="categories" className="h-4 w-4 text-faint" />
      <input
        list="prototype-pages"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Jump to… (Transactions, Rules…)"
        aria-label="Jump to a page"
        className="w-64 bg-transparent outline-none placeholder:text-faint"
      />
      <datalist id="prototype-pages">
        {ALL_LINKS.map((link) => (
          <option key={link.href} value={link.label} />
        ))}
      </datalist>
    </form>
  );
}

export function DockLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = findCurrentPage(pathname);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#f3f5f6]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{
          background:
            'radial-gradient(60% 100% at 70% 0%, rgba(59,133,151,0.28) 0%, rgba(59,133,151,0) 70%), radial-gradient(50% 80% at 10% 0%, rgba(15,67,82,0.18) 0%, rgba(15,67,82,0) 70%)',
        }}
      />

      <nav
        aria-label="Main"
        className="fixed top-1/2 left-4 z-30 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-[28px] bg-white/70 p-2 shadow-[0_20px_50px_-20px_rgba(10,47,60,0.4)] ring-1 ring-white backdrop-blur-xl md:flex"
      >
        <Link
          href="/"
          aria-label="Finance Manager"
          className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-ink font-display text-lg text-paper"
        >
          F
        </Link>
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label} className="flex flex-col gap-1">
            {index > 0 && <span aria-hidden="true" className="mx-auto my-1 h-px w-6 bg-rule" />}
            {group.links.map((link) => (
              <DockLink
                key={link.href}
                href={link.href}
                label={link.label}
                active={isActive(pathname, link.href)}
              >
                <Icon name={link.icon} className="h-5 w-5" />
              </DockLink>
            ))}
          </div>
        ))}
        <form action={logoutAction} className="mt-2">
          <button
            type="submit"
            aria-label="Sign out"
            className={`${DOCK_ITEM} text-ink-soft hover:bg-white`}
          >
            <Icon name="signOut" className="h-5 w-5" />
          </button>
        </form>
      </nav>

      <div className="relative md:pl-24">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 pt-6 md:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setIsMenuOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm md:hidden"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <p className="text-sm text-ink-soft">
            <span suppressHydrationWarning>{greeting()}</span>
            {current && (
              <>
                <span className="mx-2 text-faint">·</span>
                <span className="text-muted">{current.group.label}</span>
                <span className="mx-1.5 text-faint">/</span>
                <span className="font-medium text-ink">{current.link.label}</span>
              </>
            )}
          </p>
          <div className="ml-auto">
            <JumpTo />
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 pt-8 pb-28 md:px-6">{children}</main>
      </div>
      {isMenuOpen && <MobileDrawer onClose={() => setIsMenuOpen(false)} />}
    </div>
  );
}
