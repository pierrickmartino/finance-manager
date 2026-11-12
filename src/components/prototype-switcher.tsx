'use client';

/*
 * PROTOTYPE — throwaway. The floating bar that flips between a UI prototype's variants via the
 * `?variant=` search param (.claude/skills/prototype/UI.md). Never rendered in production.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[];
  /** Extra search-param toggles shown beside the label, e.g. sample data on/off. */
  toggles?: { param: string; values: string[] }[];
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

export function PrototypeSwitcher({ variants, toggles = [] }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentKey = params.get('variant') ?? variants[0]!.key;
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === currentKey),
  );
  const current = variants[index]!;

  function go(param: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(param, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function step(delta: number) {
    const target = variants[(index + delta + variants.length) % variants.length]!;
    go('variant', target.key);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-black px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => step(-1)}
        className="rounded px-2 py-0.5 hover:bg-white/20"
      >
        ←
      </button>
      <span className="min-w-48 text-center font-mono whitespace-nowrap">
        {current.key} · {current.name}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => step(1)}
        className="rounded px-2 py-0.5 hover:bg-white/20"
      >
        →
      </button>
      {toggles.map((toggle) => {
        const value = params.get(toggle.param) ?? toggle.values[0]!;
        const nextValue = toggle.values[(toggle.values.indexOf(value) + 1) % toggle.values.length]!;
        return (
          <button
            key={toggle.param}
            type="button"
            onClick={() => go(toggle.param, nextValue)}
            className="rounded border border-white/30 px-2 py-0.5 font-mono text-xs hover:bg-white/20"
          >
            {toggle.param}={value}
          </button>
        );
      })}
    </div>
  );
}
