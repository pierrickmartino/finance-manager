'use client';

// PROTOTYPE: throwaway UI-variant switcher. Never ships: hidden in production builds.

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

interface PrototypeSwitcherProps {
  /** Variant keys in cycling order, with an optional human name each. */
  variants: { key: string; name: string }[];
  current: string;
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

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length];
      if (!next) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set('variant', next.key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, variants, searchParams, pathname, router],
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

  const active = variants[index];
  if (!active) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1.5 text-sm font-medium text-white shadow-2xl ring-4 ring-fuchsia-300/50">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20"
      >
        ←
      </button>
      <span className="min-w-48 px-2 text-center whitespace-nowrap">
        <span className="opacity-70">PROTOTYPE · </span>
        {active.key} ({active.name})
        <span className="ml-1 opacity-70">
          {index + 1}/{variants.length}
        </span>
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}
