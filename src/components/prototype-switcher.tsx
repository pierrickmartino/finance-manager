'use client';

/**
 * PROTOTYPE — throwaway. A floating bar that cycles UI variants so they can be compared in place.
 * The current key is mirrored to `?variant=` (shareable, reload-stable). Hidden in production.
 */

import { useCallback, useEffect } from 'react';

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[];
  current: string;
  onChange: (key: string) => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/** Writes `?variant=` without a navigation, so the page underneath keeps its state. */
export function writeVariantParam(key: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('variant', key);
  window.history.replaceState(window.history.state, '', url);
}

export function readVariantParam(): string | null {
  return new URL(window.location.href).searchParams.get('variant');
}

export function PrototypeSwitcher({ variants, current, onChange }: PrototypeSwitcherProps) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length];
      if (!next) return;
      writeVariantParam(next.key);
      onChange(next.key);
    },
    [index, variants, onChange],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (process.env.NODE_ENV === 'production') return null;
  const variant = variants[index];

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1.5 text-sm font-medium text-white shadow-lg ring-2 ring-white dark:ring-zinc-900">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full px-2 hover:bg-fuchsia-500"
      >
        ←
      </button>
      <span className="px-2 whitespace-nowrap">
        Prototype · {variant?.key} ({variant?.name}) · {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full px-2 hover:bg-fuchsia-500"
      >
        →
      </button>
    </div>
  );
}
