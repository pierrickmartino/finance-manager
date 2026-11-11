'use client';

/** PROTOTYPE — throwaway. The floating bar that cycles the layout variants (prototype-layouts.ts). */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import {
  PROTOTYPE_LAYOUTS,
  PROTOTYPE_LAYOUT_COOKIE,
  PROTOTYPE_LAYOUT_PARAM,
  type PrototypeLayoutKey,
} from './prototype-layouts';

interface Props {
  current: PrototypeLayoutKey;
  onChange: (next: PrototypeLayoutKey) => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function PrototypeLayoutSwitcher({ current, onChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = PROTOTYPE_LAYOUTS.findIndex((layout) => layout.key === current);
  const name = PROTOTYPE_LAYOUTS[index]?.name;

  function go(step: number) {
    const count = PROTOTYPE_LAYOUTS.length;
    const next = PROTOTYPE_LAYOUTS[(index + step + count) % count]?.key ?? 'A';
    const params = new URLSearchParams(searchParams.toString());
    params.set(PROTOTYPE_LAYOUT_PARAM, next);
    onChange(next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Whatever is showing (picked here or opened from a ?layout= link) survives navigation.
  useEffect(() => {
    document.cookie = `${PROTOTYPE_LAYOUT_COOKIE}=${current}; Path=/; SameSite=Lax`;
    onChange(current);
  }, [current, onChange]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const arrow =
    'grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white';
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-1.5 py-1.5 text-white shadow-2xl ring-2 ring-fuchsia-400">
      <button type="button" aria-label="Previous layout" onClick={() => go(-1)} className={arrow}>
        ←
      </button>
      <span className="px-2 font-mono text-xs whitespace-nowrap">
        <span className="text-fuchsia-300">PROTOTYPE</span> {current} ({name})
      </span>
      <button type="button" aria-label="Next layout" onClick={() => go(1)} className={arrow}>
        →
      </button>
    </div>
  );
}
