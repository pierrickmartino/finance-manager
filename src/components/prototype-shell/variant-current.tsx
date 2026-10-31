'use client';
/* PROTOTYPE — app-shell redesign: today's header, kept as the baseline to compare against. */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/login/actions';
import { ALL_LINKS } from './nav';

export const NAME = 'Current';

export function VariantCurrent({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/" className="font-semibold">
            Finance Manager
          </Link>
          {ALL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
          <form action={logoutAction} className="ml-auto">
            <button
              type="submit"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
