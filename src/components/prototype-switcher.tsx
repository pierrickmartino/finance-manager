'use client';

/**
 * PROTOTYPE ONLY: the floating bar that flips between a page's UI variants (`?variant=`).
 * Never shown in production builds. Delete with the prototype it serves.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export interface PrototypeVariant {
  key: string;
  name: string;
}

/** The variant in the URL, or the first one. Production always gets the first. */
export function useVariant(variants: readonly PrototypeVariant[]): string {
  const value = useSearchParams().get('variant')?.toUpperCase();
  if (process.env.NODE_ENV === 'production') return variants[0]!.key;
  return variants.some((variant) => variant.key === value) ? value! : variants[0]!.key;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === 'checkbox') return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

interface PrototypeSwitcherProps {
  variants: readonly PrototypeVariant[];
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

  const go = (step: number): void => {
    const next = variants[(index + step + variants.length) % variants.length]!;
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
  const variant = variants[index]!;
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
        PROTOTYPE · {variant.key} ({variant.name})
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
