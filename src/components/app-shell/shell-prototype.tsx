'use client';

/**
 * PROTOTYPE ONLY: what should the app shell look like to show more on screen, with smaller
 * titles? (`?shell=A…D`, any signed-in page.)
 *
 * Four shells, switched from the floating bar (or ← / →). The choice goes on
 * <html data-shell="…"> (the prototype block at the end of globals.css shrinks page titles,
 * section titles and headline amounts for it) and into a tiny store AppShell reads to pick its
 * layout. It sticks for the tab (sessionStorage) as you navigate. Never shown in production.
 * Delete with the prototype.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

export const SHELL_VARIANTS = [
  { key: 'A', name: 'Current hero' },
  { key: 'B', name: 'Slim navy bar' },
  { key: 'C', name: 'Light sidebar' },
  { key: 'D', name: 'Icon rail + toolbar' },
] as const;
export type ShellVariant = (typeof SHELL_VARIANTS)[number]['key'];

const PARAM = 'shell';
const STORAGE_KEY = 'prototype-shell-variant';

// A tiny store so AppShell (outside the Suspense boundary useSearchParams needs) can follow.
let currentVariant: ShellVariant = 'A';
const listeners = new Set<() => void>();
function setVariant(key: ShellVariant): void {
  if (key === currentVariant) return;
  currentVariant = key;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The shell variant in force; 'A' on the server. */
export function useShellVariant(): ShellVariant {
  return useSyncExternalStore(
    subscribe,
    () => currentVariant,
    () => 'A',
  );
}

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function store(key: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Private window: the URL still carries the variant.
  }
}

const subscribeToNothing = () => () => {};

function isKnown(key: string | null | undefined): key is ShellVariant {
  return SHELL_VARIANTS.some((variant) => variant.key === key);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === 'checkbox') return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function ShellPrototypeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get(PARAM)?.toUpperCase();
  const stored = useSyncExternalStore(subscribeToNothing, readStored, () => null);

  const current: ShellVariant = isKnown(fromUrl) ? fromUrl : isKnown(stored) ? stored : 'A';
  const index = SHELL_VARIANTS.findIndex((variant) => variant.key === current);

  useEffect(() => {
    document.documentElement.dataset.shell = current;
    store(current);
    setVariant(current);
  }, [current]);

  const go = (step: number): void => {
    const next = SHELL_VARIANTS[(index + step + SHELL_VARIANTS.length) % SHELL_VARIANTS.length]!;
    const params = new URLSearchParams(searchParams.toString());
    params.set(PARAM, next.key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;
  const variant = SHELL_VARIANTS[index]!;
  return (
    <div
      aria-label="Prototype variant switcher"
      className="fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#ff2d78] px-1.5 py-1 text-sm font-semibold text-white shadow-2xl ring-2 ring-white"
    >
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full px-2.5 py-0.5 hover:bg-white/20"
      >
        ←
      </button>
      <span className="px-2 whitespace-nowrap">
        PROTOTYPE shell · {variant.key} ({variant.name})
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full px-2.5 py-0.5 hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}
