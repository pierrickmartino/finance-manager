'use client';
/* PROTOTYPE — floating variant switcher (← / → keys, wraps). Never rendered in production. */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export interface SwitcherVariant {
  key: string;
  name: string;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Writes `?variant=` with the router so the choice is shareable and survives a reload. */
export function PrototypeSwitcher({ variants }: { variants: SwitcherVariant[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('variant') ?? variants[0]!.key;
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const step = (delta: number) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('variant', variants[(index + delta + variants.length) % variants.length]!.key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      data-prototype-switcher
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 p-1 font-mono text-xs text-white shadow-2xl ring-4 ring-fuchsia-600/20"
    >
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Previous variant"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20"
      >
        ←
      </button>
      <span className="px-2 whitespace-nowrap">
        PROTOTYPE · {variants[index]!.key} ({variants[index]!.name}) · {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Next variant"
        className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}
