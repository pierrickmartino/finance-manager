'use client';

/**
 * PROTOTYPE ONLY: what colour, and what shape, should a warning be? (`?warning=A…D`, any page.)
 *
 * The variant goes on <html data-warning="…">; the prototype block at the end of globals.css
 * swaps the warning tokens and restyles `.warning-notice` / `.warning-badge` for it, so every
 * real warning in the app (stale FX, snapshot mismatches, Gaps, Missed badges) shows it in place.
 * The choice sticks for the tab (sessionStorage) as you navigate. Never shown in production.
 * Delete with the prototype.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

const VARIANTS = [
  { key: 'A', name: 'Current amber' },
  { key: 'B', name: 'Terracotta' },
  { key: 'C', name: 'Edge bar' },
  { key: 'D', name: 'Solid' },
] as const;

const PARAM = 'warning';
const STORAGE_KEY = 'prototype-warning-variant';

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

function isKnown(key: string | null | undefined): key is string {
  return VARIANTS.some((variant) => variant.key === key);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === 'checkbox') return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function WarningPrototype() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get(PARAM)?.toUpperCase();
  const stored = useSyncExternalStore(subscribeToNothing, readStored, () => null);

  const current = isKnown(fromUrl) ? fromUrl : isKnown(stored) ? stored : 'A';
  const index = VARIANTS.findIndex((variant) => variant.key === current);

  useEffect(() => {
    document.documentElement.dataset.warning = current;
    store(current);
  }, [current]);

  const go = (step: number): void => {
    const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length]!;
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
  const variant = VARIANTS[index]!;
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
        PROTOTYPE warnings · {variant.key} ({variant.name})
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
