'use client';

/**
 * PROTOTYPE — throwaway floating bar that cycles `?variant=` on the current route.
 * ← / → keys cycle too (ignored while typing). Never rendered in production builds.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
  /** Search params a variant switch drops (variant-specific selection state). */
  resetParams?: string[];
}

export function PrototypeSwitcher({ variants, current, resetParams = [] }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length]!;
      const params = new URLSearchParams(searchParams.toString());
      params.set('variant', next.key);
      for (const key of resetParams) params.delete(key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, variants, resetParams, searchParams, pathname, router],
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
  const active = variants[index]!;
  const button =
    'grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400';
  return (
    <div
      data-testid="prototype-switcher"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-950 px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-400"
    >
      <button type="button" aria-label="Previous variant" onClick={() => go(-1)} className={button}>
        ←
      </button>
      <span className="min-w-48 text-center font-medium">
        <span className="mr-1 rounded bg-fuchsia-400 px-1.5 py-0.5 text-xs font-bold text-fuchsia-950">
          PROTOTYPE
        </span>
        {active.key} ({active.name})
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(1)} className={button}>
        →
      </button>
    </div>
  );
}
