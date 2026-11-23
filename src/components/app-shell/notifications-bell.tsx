'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { transactionCountLabel } from '@/lib/text';
import type { AttentionItem } from '@/server/services/attention';
import { BADGE_CLASS, POPOVER_CLASS } from '../surface';
import { BAR_ICON_BUTTON_CLASS } from './bar-styles';
import { Icon } from './icon';

/** The item's line, worded as its own page words it. */
function itemLine(item: AttentionItem): string {
  const verb = item.count === 1 ? 'is' : 'are';
  return `${transactionCountLabel(item.count)} ${verb} Unclassified`;
}

/** The item's badge, in its tone: what kind of attention it asks for. */
const BADGES: Record<AttentionItem['kind'], string> = { unclassified: 'Unclassified' };

interface NotificationsBellProps {
  /** The current Attention items, in display order; null while they are still worked out. */
  items: readonly AttentionItem[] | null;
}

/**
 * The top bar's bell: opens a popover listing the current Attention items (GLOSSARY), each a
 * link to where it is fixed. Closes on Escape (focus back on the bell), a click outside it or
 * following a link, as the More menu does.
 */
export function NotificationsBell({ items }: NotificationsBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = `${panelId}-title`;

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
    <div ref={rootRef} className="sm:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className={BAR_ICON_BUTTON_CLASS}
      >
        <Icon name="bell" />
      </button>
      {isOpen && (
        // On a phone the popover spans the screen within its 16px gutters; wider, it hangs
        // under the bell.
        <div
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          aria-busy={items === null}
          className={`fixed inset-x-4 top-12 z-40 sm:absolute sm:inset-x-auto sm:top-9 sm:right-0 sm:w-[24rem] ${POPOVER_CLASS}`}
        >
          <h2 id={titleId} className="flex items-center gap-2 px-2 pt-1 pb-2 text-sm font-medium">
            Needs attention
            {items !== null && (
              <span className={BADGE_CLASS.neutral} aria-label={String(items.length)}>
                {items.length}
              </span>
            )}
          </h2>
          <BellContent items={items} onFollow={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}

function BellContent({
  items,
  onFollow,
}: NotificationsBellProps & {
  /** Called when an item's link is followed: the popover closes. */
  onFollow: () => void;
}) {
  if (items === null) return <p className="px-2 pb-1 text-sm text-muted">Loading</p>;
  if (items.length === 0) {
    return <p className="px-2 pb-1 text-sm text-ink-soft">Nothing needs attention</p>;
  }
  return (
    <ul>
      {items.map((item) => (
        <li key={`${item.kind}:${item.subject ?? ''}`}>
          <Link
            href={item.href}
            onClick={onFollow}
            aria-label={itemLine(item)}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:bg-sunken hover:text-ink"
          >
            <span>{itemLine(item)}</span>
            <span aria-hidden="true" className={BADGE_CLASS[item.tone]}>
              {BADGES[item.kind]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
