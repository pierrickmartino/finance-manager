'use client';

/**
 * PROTOTYPE (throwaway): floating bar that cycles `?variant=` on the current route.
 * Hidden in production builds. Delete with the prototype it serves.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length]!;
    const params = new URLSearchParams(searchParams.toString());
    params.set('variant', next.key);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;
  const variant = variants[index]!;
  return (
    <div
      role="toolbar"
      aria-label="Prototype variant switcher"
      className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-dashed border-[#facc15] bg-black px-2 py-1.5 font-mono text-xs text-white shadow-2xl"
    >
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15"
      >
        ←
      </button>
      <span className="min-w-56 px-2 text-center">
        <span className="text-[#facc15]">PROTOTYPE</span> {variant.key} ({variant.name}) ·{' '}
        {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15"
      >
        →
      </button>
    </div>
  );
}
