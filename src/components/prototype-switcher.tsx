'use client';

/**
 * PROTOTYPE: a floating bar that cycles the `?variant=` search param (← / → keys too). Never
 * rendered in production builds. Lives on the throwaway prototype branch only.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

interface PrototypeSwitcherProps {
  variants: readonly { key: string; name: string }[];
  current: string;
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
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
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#fde047] p-1 font-mono text-sm text-black shadow-[0_8px_30px_rgba(0,0,0,0.6)] ring-2 ring-black">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full px-3 py-1 hover:bg-black/10"
      >
        ←
      </button>
      <span className="px-2 whitespace-nowrap">
        PROTOTYPE · {variant.key} ({variant.name})
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
