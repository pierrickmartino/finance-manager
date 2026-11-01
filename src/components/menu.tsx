'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface MenuProps {
  /** What the toggle shows. */
  trigger: ReactNode;
  /** The toggle's accessible name, when `trigger` is only a symbol. */
  label?: string;
  triggerClassName: string;
  children: ReactNode;
}

/**
 * A disclosure that drops a panel under its toggle. It closes on a click outside it or on
 * Escape; it stays open after a form inside it is submitted, so its error shows there.
 */
export function Menu({ trigger, label, triggerClassName, children }: MenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close(event: Event) {
      const details = ref.current;
      if (!details?.open) return;
      const isEscape = event instanceof KeyboardEvent && event.key === 'Escape';
      const isOutside = event.type === 'pointerdown' && !details.contains(event.target as Node);
      if (isEscape || isOutside) details.open = false;
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary aria-label={label} className={`cursor-pointer list-none ${triggerClassName}`}>
        {trigger}
      </summary>
      <div className="absolute right-0 z-10 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </details>
  );
}
