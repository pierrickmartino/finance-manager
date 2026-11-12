'use client';

/**
 * PROTOTYPE ONLY: throwaway. A floating bar that cycles a `?variant=` search param, for
 * comparing UI variants on a real route. Never rendered in production builds.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

export interface PrototypeVariant {
  key: string;
  name: string;
}

/** The current variant key from `?variant=`, or the first variant's. */
export function usePrototypeVariant(variants: readonly PrototypeVariant[]): string {
  const params = useSearchParams();
  const key = params.get('variant');
  return variants.some((variant) => variant.key === key) ? key! : variants[0]!.key;
}

export function PrototypeSwitcher({ variants }: { variants: readonly PrototypeVariant[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = usePrototypeVariant(variants);
  const index = variants.findIndex((variant) => variant.key === current);

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length]!;
      const query = new URLSearchParams(params.toString());
      query.set('variant', next.key);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [index, params, pathname, router, variants],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (process.env.NODE_ENV === 'production') return null;
  const variant = variants[index]!;
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#ff2d87] p-1 text-sm font-semibold text-white shadow-2xl ring-4 ring-white"
      data-prototype-switcher
    >
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full px-3 py-1.5 hover:bg-white/20"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="min-w-56 px-2 text-center tabular-nums">
        PROTOTYPE · {variant.key} ({variant.name})
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="rounded-full px-3 py-1.5 hover:bg-white/20"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
}
