'use client';

/*
 * PROTOTYPE: throwaway. A floating bar that cycles a `?variant=` search param between UI
 * prototype variants (.claude/skills/prototype/UI.md). Never shipped: renders nothing in
 * production builds.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function usePrototypeVariant(variants: PrototypeVariant[]): string {
  const key = useSearchParams().get('variant');
  return variants.some((variant) => variant.key === key) ? key! : variants[0]!.key;
}

export function PrototypeSwitcher({ variants }: { variants: PrototypeVariant[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = usePrototypeVariant(variants);
  const index = variants.findIndex((variant) => variant.key === current);

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length]!;
      const params = new URLSearchParams(searchParams.toString());
      params.set('variant', next.key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, pathname, router, searchParams, variants],
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
      style={{ background: '#111', color: '#fff', fontFamily: 'ui-monospace, monospace' }}
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-1.5 text-sm shadow-2xl ring-2 ring-fuchsia-500"
    >
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full px-3 py-1 hover:bg-white/15"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="min-w-56 text-center">
        PROTOTYPE · {variant.key} ({variant.name})
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
