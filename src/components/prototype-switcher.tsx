'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

/**
 * PROTOTYPE ONLY — floating bar that cycles `?variant=` on the current route.
 * Hidden in production builds. Delete once the prototype is decided.
 */
export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: { key: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    if (!next) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('variant', next.key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;
  const active = variants[index];
  if (!active) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1 text-sm font-medium text-white shadow-lg ring-2 ring-white/60">
      <button
        type="button"
        aria-label="Previous variant"
        className="rounded-full px-2 py-0.5 hover:bg-white/20"
        onClick={() => go(-1)}
      >
        ←
      </button>
      <span className="px-2 tabular-nums">
        PROTOTYPE · {active.key} ({active.name}) · {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        className="rounded-full px-2 py-0.5 hover:bg-white/20"
        onClick={() => go(1)}
      >
        →
      </button>
    </div>
  );
}
