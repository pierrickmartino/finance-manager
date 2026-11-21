'use client';

/**
 * PROTOTYPE ONLY: what should Analytics look like to show more on screen, with smaller titles?
 * (`/analytics?variant=A…D`.) The floating bar (or ← / →) switches the variant; a cookie keeps it
 * as the Period view changes (its links drop the parameter). Never shown in production. Delete
 * with the prototype.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { ANALYTICS_VARIANTS, VARIANT_COOKIE, type AnalyticsVariant } from './analytics-variants';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function AnalyticsPrototypeSwitcher({ current }: { current: AnalyticsVariant }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = ANALYTICS_VARIANTS.findIndex((variant) => variant.key === current);

  useEffect(() => {
    document.cookie = `${VARIANT_COOKIE}=${current}; path=/; SameSite=Lax`;
  }, [current]);

  const go = (step: number): void => {
    const count = ANALYTICS_VARIANTS.length;
    const next = ANALYTICS_VARIANTS[(index + step + count) % count]!;
    document.cookie = `${VARIANT_COOKIE}=${next.key}; path=/; SameSite=Lax`;
    const params = new URLSearchParams(searchParams.toString());
    params.set('variant', next.key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;
  const variant = ANALYTICS_VARIANTS[index]!;
  return (
    <div
      aria-label="Prototype variant switcher"
      className="fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#ff2d78] px-1.5 py-1 text-sm font-semibold text-white shadow-2xl ring-2 ring-white"
    >
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full px-2.5 py-0.5 hover:bg-white/20"
      >
        ←
      </button>
      <span className="px-2 whitespace-nowrap">
        PROTOTYPE analytics · {variant.key} ({variant.name})
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full px-2.5 py-0.5 hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}
