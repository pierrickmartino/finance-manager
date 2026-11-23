'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { Formatter } from '@/lib/format';
import { transactionCountLabel } from '@/lib/text';
import type { AttentionItem } from '@/server/services/attention';
import { useFormatter } from '../formatter-provider';
import { BADGE_CLASS, POPOVER_CLASS } from '../surface';
import { BAR_ICON_BUTTON_CLASS } from './bar-styles';
import { useBellOpen } from './bell-open';
import { completenessLine } from './completeness-line';
import { Icon } from './icon';
import { useAttentionItems } from './use-attention-items';

/** The item's line, worded as its own page words it, dates and amounts in the user's formats. */
function itemLine(item: AttentionItem, fmt: Formatter): string {
  switch (item.kind) {
    case 'fx-rates':
      return `FX rates are stale: ${item.reason}. CHF values may be out of date.`;
    case 'completeness':
      return completenessLine(item, fmt);
    case 'missed':
      return `${item.payeeName} was Missed: expected ${fmt.date(item.expectedDate)}`;
    case 'price-increase': {
      const from = fmt.amount(item.previousAmountMinor, { currency: item.currency });
      const to = fmt.amount(item.lastAmountMinor, { currency: item.currency });
      return `${item.payeeName} is up from ${from} to ${to}`;
    }
    case 'unclassified':
      return `${transactionCountLabel(item.count)} ${item.count === 1 ? 'is' : 'are'} Unclassified`;
  }
}

/** The item's badge, in its tone: what kind of attention it asks for. */
const BADGES: Record<AttentionItem['kind'], string> = {
  'fx-rates': 'Stale',
  completeness: 'Completeness',
  missed: 'Missed',
  'price-increase': 'Price increase',
  unclassified: 'Unclassified',
};

/** An item's identity, kind plus subject: its key in the list. */
function itemKey(item: AttentionItem): string {
  return `${item.kind}:${item.subject ?? ''}`;
}

/** The bell's accessible name: what the dot says, in words. */
function bellLabel(unreadCount: number): string {
  return unreadCount === 0 ? 'Notifications' : `Notifications, ${unreadCount} unread`;
}

interface NotificationsBellProps {
  /** The current Attention items, in display order; null while they are still worked out. */
  items: readonly AttentionItem[] | null;
}

/**
 * The top bar's bell: opens a popover listing the current Attention items (GLOSSARY), each a
 * link to where it is fixed. A dot on it shows that some are unread; opening it marks them all
 * read and marks, in the list, the ones that were. Closes on Escape (focus back on the bell), a
 * click outside it or following a link, as the More menu does.
 */
export function NotificationsBell({ items: served }: NotificationsBellProps) {
  const { items, markSeen } = useAttentionItems(served);
  const [isOpen, setIsOpen] = useBellOpen();
  // The items that were unread when the bell was opened: marked in the list while it is open.
  const [unreadWhenOpened, setUnreadWhenOpened] = useState<ReadonlySet<string>>(new Set());
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
  }, [isOpen, setIsOpen]);

  // Opening marks everything listed read, once per opening. Opened while still loading, the
  // bell marks the items when they arrive: this bell takes the loading one's place, still open.
  const isMarkedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      isMarkedRef.current = false;
      return;
    }
    if (items === null || isMarkedRef.current) return;
    isMarkedRef.current = true;
    setUnreadWhenOpened(new Set(items.filter((item) => item.unread).map(itemKey)));
    markSeen();
  }, [isOpen, items, markSeen]);

  const unreadCount = items?.filter((item) => item.unread).length ?? 0;

  return (
    <div ref={rootRef} className="sm:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={bellLabel(unreadCount)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative ${BAR_ICON_BUTTON_CLASS}`}
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span
            data-testid="unread-dot"
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-paper"
          />
        )}
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
          <BellContent items={items} unread={unreadWhenOpened} onFollow={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}

function BellContent({
  items,
  unread,
  onFollow,
}: NotificationsBellProps & {
  /** The keys of the items to mark unread. */
  unread: ReadonlySet<string>;
  /** Called when an item's link is followed: the popover closes. */
  onFollow: () => void;
}) {
  const fmt = useFormatter();
  if (items === null) return <p className="px-2 pb-1 text-sm text-muted">Loading</p>;
  if (items.length === 0) {
    return <p className="px-2 pb-1 text-sm text-ink-soft">Nothing needs attention</p>;
  }
  return (
    <ul>
      {items.map((item) => {
        const isUnread = unread.has(itemKey(item));
        const line = itemLine(item, fmt);
        return (
          <li key={itemKey(item)}>
            <Link
              href={item.href}
              onClick={onFollow}
              aria-label={isUnread ? `${line}, unread` : line}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken hover:text-ink ${isUnread ? 'font-medium text-ink' : 'text-ink-soft'}`}
            >
              {/* The unread marker, the dot's own mark; a read item keeps its place. */}
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${isUnread ? 'bg-accent' : ''}`}
              />
              <span className="flex-1">{line}</span>
              <span aria-hidden="true" className={BADGE_CLASS[item.tone]}>
                {BADGES[item.kind]}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
