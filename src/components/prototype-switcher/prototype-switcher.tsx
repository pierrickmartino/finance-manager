'use client';
/**
 * PROTOTYPE (Tremor redesign), throwaway: the floating bar that cycles the ?variant= designs.
 * ← / → (outside text fields) cycle too. Hidden in production builds.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import {
  PROTOTYPE_COOKIE,
  PROTOTYPE_VARIANTS,
  isPrototypeEnabled,
  type PrototypeVariant,
} from './variants';

export function PrototypeSwitcher({ current }: { current: PrototypeVariant }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = PROTOTYPE_VARIANTS.findIndex((v) => v.key === current);

  function go(step: number) {
    const next =
      PROTOTYPE_VARIANTS[(index + step + PROTOTYPE_VARIANTS.length) % PROTOTYPE_VARIANTS.length]!;
    document.cookie = `${PROTOTYPE_COOKIE}=${next.key}; path=/; max-age=31536000; samesite=lax`;
    const params = new URLSearchParams(searchParams.toString());
    params.set('variant', next.key);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!isPrototypeEnabled) return null;
  const variant = PROTOTYPE_VARIANTS[index]!;
  return (
    <div
      data-prototype-switcher
      className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#ff2d78] p-1 text-sm font-semibold text-white shadow-2xl ring-4 ring-white"
    >
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => go(-1)}
        className="rounded-full px-3 py-1.5 hover:bg-white/20"
      >
        ←
      </button>
      <span className="min-w-56 px-2 text-center">
        Prototype {variant.key} · {variant.name}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => go(1)}
        className="rounded-full px-3 py-1.5 hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}
