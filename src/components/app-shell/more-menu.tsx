'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icon';
import { isActive, overflowGroups } from './navigation';
import { HERO_PILL_ACTIVE, HERO_PILL_CLASS, HERO_PILL_IDLE } from './hero-styles';

const GROUPS = overflowGroups();

/**
 * The top bar's last pill: every page that isn't a pill, in its group. Shown as current while
 * one of those pages is open. Closes on Escape (focus back on the pill), a click outside it or
 * following a link.
 */
export function MoreMenu({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const isCurrent = GROUPS.some((group) =>
    group.links.some((link) => isActive(pathname, link.href)),
  );

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className={`${HERO_PILL_CLASS} ${isCurrent ? HERO_PILL_ACTIVE : HERO_PILL_IDLE}`}
      >
        <Icon name="menu" />
        More
      </button>
      {isOpen && (
        <div
          id={panelId}
          className="absolute top-12 right-0 z-40 grid w-[28rem] grid-cols-2 gap-4 rounded-2xl border border-rule bg-surface p-4 shadow-2xl"
        >
          {GROUPS.map((group) => {
            const labelId = `${panelId}-${group.label.toLowerCase()}`;
            return (
              <div key={group.label}>
                <p id={labelId} className="px-2 pb-1 text-xs text-muted">
                  {group.label}
                </p>
                <ul aria-labelledby={labelId}>
                  {group.links.map((link) => {
                    const active = isActive(pathname, link.href);
                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          onClick={() => setIsOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken ${active ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink-soft hover:text-ink'}`}
                        >
                          <Icon name={link.icon} />
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
