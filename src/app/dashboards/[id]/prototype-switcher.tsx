'use client';

/** PROTOTYPE — throwaway. The floating bar that cycles the Dashboard variants (prototype-variants.ts). */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import {
  IS_PROTOTYPE_ENABLED,
  PROTOTYPE_VARIANTS,
  PROTOTYPE_VARIANT_PARAM,
  type PrototypeVariantKey,
} from './prototype-variants';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function PrototypeSwitcher({ current }: { current: PrototypeVariantKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = PROTOTYPE_VARIANTS.findIndex((variant) => variant.key === current);

  function go(step: number) {
    const count = PROTOTYPE_VARIANTS.length;
    const next = PROTOTYPE_VARIANTS[(index + step + count) % count]!.key;
    const params = new URLSearchParams(searchParams.toString());
    params.set(PROTOTYPE_VARIANT_PARAM, next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!IS_PROTOTYPE_ENABLED) return null;
  const arrow =
    'grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white';
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-1.5 py-1.5 text-white shadow-2xl ring-2 ring-fuchsia-400">
      <button type="button" aria-label="Previous variant" onClick={() => go(-1)} className={arrow}>
        ←
      </button>
      <span className="px-2 font-mono text-xs whitespace-nowrap">
        <span className="text-fuchsia-300">PROTOTYPE</span> {current} (
        {PROTOTYPE_VARIANTS[index]?.name})
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(1)} className={arrow}>
        →
      </button>
    </div>
  );
}
