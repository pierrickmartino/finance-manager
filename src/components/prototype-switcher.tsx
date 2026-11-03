'use client';

/**
 * PROTOTYPE: floating bar that cycles a page's `?variant=` (← / → keys too). Throwaway: it
 * never renders in a production build, and it should not outlive the prototype it serves.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

interface PrototypeSwitcherProps {
  variants: ReadonlyArray<{ key: string; name: string }>;
  current: string;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
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
      params.delete('step');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, pathname, router, searchParams, variants],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (process.env.NODE_ENV === 'production') return null;
  const variant = variants[index];
  if (!variant) return null;
  return (
    <div
      role="toolbar"
      aria-label="Prototype variants"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1.5 text-sm font-medium text-white shadow-lg ring-2 ring-white"
    >
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full px-2 hover:bg-fuchsia-500"
      >
        ←
      </button>
      <span className="min-w-48 text-center tabular-nums">
        {variant.key} ({variant.name}) · {index + 1}/{variants.length}
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
