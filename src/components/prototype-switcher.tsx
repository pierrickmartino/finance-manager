'use client';

/**
 * PROTOTYPE ONLY — throwaway. A floating bar that cycles the `?variant=` search param of the
 * current route (← / → keys too). Never shipped: renders nothing in production builds.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

interface Variant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({ variants }: { variants: readonly Variant[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('variant') ?? variants[0]!.key;
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

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
  const variant = variants[index]!;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#e11d48] p-1 text-sm text-white shadow-2xl ring-2 ring-white">
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full px-3 py-1 hover:bg-white/20"
      >
        ←
      </button>
      <span className="px-2 font-medium whitespace-nowrap">
        Prototype · {variant.key} ({variant.name}) · {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="rounded-full px-3 py-1 hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}
