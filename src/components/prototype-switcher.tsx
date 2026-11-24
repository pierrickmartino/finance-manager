'use client';

/**
 * PROTOTYPE — throwaway. A floating bar that cycles a page's `?variant=` (← / → or the arrow
 * keys), so UI variants can be compared on the real route. Never shown in production builds.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

interface PrototypeSwitcherProps {
  variants: readonly { key: string; name: string }[];
  /** The search param it drives. */
  param?: string;
}

export function PrototypeSwitcher({ variants, param = 'variant' }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentKey = searchParams.get(param) ?? variants[0]!.key;
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === currentKey),
  );
  const current = variants[index]!;

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length]!;
      const params = new URLSearchParams(searchParams.toString());
      params.set(param, next.key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, param, pathname, router, searchParams, variants],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-yellow-300 p-1 text-sm font-semibold text-black shadow-2xl ring-2 ring-black">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full px-3 py-1 hover:bg-black/10"
      >
        ←
      </button>
      <span className="px-2 whitespace-nowrap tabular-nums">
        Prototype {index + 1}/{variants.length}: {current.key} ({current.name})
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full px-3 py-1 hover:bg-black/10"
      >
        →
      </button>
    </div>
  );
}
