'use client';

/**
 * PROTOTYPE: the floating bar that flips between UI variants via `?variant=`. Throwaway; hidden
 * in production builds. See src/app/prototype-layout/README.md.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

const STORAGE_KEY = 'prototype-variant';

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[];
  current: string;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length]!;
    const params = new URLSearchParams(searchParams);
    params.set('variant', next.key);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  // Remember the variant, so links that drop `?variant=` keep it on the next page.
  const asked = searchParams.get('variant');
  useEffect(() => {
    try {
      if (asked) sessionStorage.setItem(STORAGE_KEY, asked);
      const remembered = sessionStorage.getItem(STORAGE_KEY);
      if (!asked && remembered && remembered !== variants[0]!.key) {
        const params = new URLSearchParams(searchParams);
        params.set('variant', remembered);
        router.replace(`${pathname}?${params}`, { scroll: false });
      }
    } catch {
      // No storage (private window): the variant just lasts for this page.
    }
  }, [asked, pathname, router, searchParams, variants]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;
  const variant = variants[index]!;
  const button =
    'grid h-8 w-8 place-items-center rounded-full text-lg text-white/80 hover:bg-white/15 hover:text-white';
  return (
    <div
      role="toolbar"
      aria-label="Prototype variants"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
      className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ff1f8e] px-2 py-1.5 text-sm text-white shadow-2xl ring-4 ring-white/70"
    >
      <button type="button" aria-label="Previous variant" onClick={() => go(-1)} className={button}>
        ←
      </button>
      <span className="min-w-48 text-center font-medium">
        {variant.key} <span className="text-white/75">({variant.name})</span>
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(1)} className={button}>
        →
      </button>
    </div>
  );
}
