'use client';

/**
 * PROTOTYPE (throwaway): floating bar to flip between UI variants via `?variant=`.
 * ← / → cycle (except while typing). Shown in every build, production included, on request.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

export interface SwitcherVariant {
  key: string;
  name: string;
}

export function PrototypeSwitcher({ variants }: { variants: SwitcherVariant[] }) {
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
      router.replace(`${pathname}?${query}`, { scroll: false });
    },
    [index, params, pathname, router, variants],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      // A Widget's move handle uses the arrow keys too (and prevents their default).
      if (event.defaultPrevented) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const variant = variants[index]!;
  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-fuchsia-500 bg-black px-2 py-1.5 font-mono text-sm text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full px-3 py-1 hover:bg-white/15"
      >
        ←
      </button>
      <span className="min-w-56 text-center">
        <span className="mr-2 rounded bg-fuchsia-500 px-1.5 text-xs font-bold">PROTOTYPE</span>
        {variant.key} ({variant.name})
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full px-3 py-1 hover:bg-white/15"
      >
        →
      </button>
    </div>
  );
}
