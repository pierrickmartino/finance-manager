'use client';

/**
 * PROTOTYPE ONLY: floating bar that cycles `?variant=` on the current route.
 * Never ships: renders nothing in production builds.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: ReadonlyArray<PrototypeVariant>;
  current: string;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length];
      if (!next) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set('variant', next.key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, variants, searchParams, pathname, router],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (process.env.NODE_ENV === 'production') return null;

  const active = variants[index];
  if (!active) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1.5 font-mono text-sm text-white shadow-2xl ring-4 ring-fuchsia-600/20">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => go(-1)}
        className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/20"
      >
        ←
      </button>
      <span className="min-w-56 px-2 text-center">
        <span className="font-bold">{active.key}</span> ({active.name}) · {index + 1}/
        {variants.length}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => go(1)}
        className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/20"
      >
        →
      </button>
    </div>
  );
}
