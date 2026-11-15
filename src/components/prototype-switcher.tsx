'use client';

/*
 * PROTOTYPE: a throwaway variant switcher. Delete it with the prototype it serves.
 * A floating bar that cycles `?variant=` (arrows, or ← → keys). Hidden in production builds.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function usePrototypeVariant(variants: PrototypeVariant[]): string {
  const params = useSearchParams();
  const wanted = params.get('variant');
  return variants.some((variant) => variant.key === wanted) ? wanted! : variants[0]!.key;
}

export function PrototypeSwitcher({ variants }: { variants: PrototypeVariant[] }) {
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
  const shown = variants[index]!;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-400">
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full px-3 py-1 hover:bg-white/15"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="min-w-56 px-2 text-center tabular-nums">
        PROTOTYPE · {shown.key} ({shown.name}) · {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="rounded-full px-3 py-1 hover:bg-white/15"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
}
