'use client';

import Link from 'next/link';
import { Suspense, useEffect, useId, useRef, useState } from 'react';
import type { Formatter } from '@/lib/format';
import { transactionCountLabel } from '@/lib/text';
import type { AttentionItem } from '@/server/services/attention';
import { useFormatter } from '../formatter-provider';
import { BADGE_CLASS, POPOVER_CLASS } from '../surface';
import { BAR_ICON_BUTTON_CLASS } from './bar-styles';
import { completenessLine } from './completeness-line';
import { Icon } from './icon';
import {
  useAttentionItems,
  useItems,
  type AttentionItemsSource,
  type ServedAttentionItems,
} from './use-attention-items';

/** The item's line, worded as its own page words it, dates and amounts in the user's formats. */
function itemLine(item: AttentionItem, fmt: Formatter): string {
  switch (item.kind) {
    case 'fx-rates':
      return `FX rates are Stale: ${item.reason}. CHF values may be out of date.`;
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

/** The bell's accessible name: what the dot says, in words. */
function bellLabel(unreadCount: number): string {
  return unreadCount === 0 ? 'Notifications' : `Notifications, ${unreadCount} unread`;
}

interface NotificationsBellProps {
  /** The current Attention items, in display order, as the server works them out. */
  items: ServedAttentionItems;
}

/**
 * The top bar's bell: opens a popover listing the current Attention items (GLOSSARY), each a
 * link to where it is fixed. A dot on it shows that some are unread; opening it marks them all
 * read and marks, in the list, the ones that were. Closes on Escape (focus back on the bell), a
 * click outside it or following a link, as the More menu does.
 *
 * The button renders at once, with the shell, so it works as soon as the page does; only the
 * dot and the list wait for the items (ADR-0019: streamed, the page never waits on them).
 */
export function NotificationsBell({ items: served }: NotificationsBellProps) {
  const { source, markSeen } = useAttentionItems(served);
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
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative ${BAR_ICON_BUTTON_CLASS}`}
      >
        <Icon name="bell" />
        <Suspense fallback={<span className="sr-only">{bellLabel(0)}</span>}>
          <UnreadMark source={source} />
        </Suspense>
      </button>
      {isOpen && (
        // On a phone the popover spans the screen within its 16px gutters; wider, it hangs
        // under the bell.
        <div
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          className={`fixed inset-x-4 top-12 z-40 sm:absolute sm:inset-x-auto sm:top-9 sm:right-0 sm:w-[24rem] ${POPOVER_CLASS}`}
        >
          <Suspense fallback={<LoadingList titleId={titleId} />}>
            <BellList
              source={source}
              titleId={titleId}
              markSeen={markSeen}
              onFollow={() => setIsOpen(false)}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

/** The bell's label, and its dot while some items are unread. */
function UnreadMark({ source }: { source: AttentionItemsSource }) {
  const unreadCount = useItems(source).filter((item) => item.unread).length;
  return (
    <>
      <span className="sr-only">{bellLabel(unreadCount)}</span>
      {unreadCount > 0 && (
        <span
          data-testid="unread-dot"
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-paper"
        />
      )}
    </>
  );
}

function PopoverTitle({ titleId, count }: { titleId: string; count?: number }) {
  return (
    <h2 id={titleId} className="flex items-center gap-2 px-2 pt-1 pb-2 text-sm font-medium">
      Needs attention
      {count !== undefined && (
        <span className={BADGE_CLASS.neutral} aria-label={String(count)}>
          {count}
        </span>
      )}
    </h2>
  );
}

function LoadingList({ titleId }: { titleId: string }) {
  return (
    <>
      <PopoverTitle titleId={titleId} />
      <p className="px-2 pb-1 text-sm text-muted">Loading</p>
    </>
  );
}

interface BellListProps {
  source: AttentionItemsSource;
  titleId: string;
  markSeen: (items: readonly AttentionItem[]) => void;
  /** Called when an item's link is followed: the popover closes. */
  onFollow: () => void;
}

/**
 * The popover's list. It mounts on each opening, once the items are in: it keeps the ones
 * unread then marked while it is open, and marks everything read.
 */
function BellList({ source, titleId, markSeen, onFollow }: BellListProps) {
  const fmt = useFormatter();
  const items = useItems(source);
  const [unread] = useState<ReadonlySet<string>>(
    () => new Set(items.filter((item) => item.unread).map((item) => item.key)),
  );
  // Once per opening, whatever re-renders follow (and React's development double effects).
  const isMarkedRef = useRef(false);
  useEffect(() => {
    if (isMarkedRef.current) return;
    isMarkedRef.current = true;
    markSeen(items);
  }, [items, markSeen]);

  return (
    <>
      <PopoverTitle titleId={titleId} count={items.length} />
      {items.length === 0 ? (
        <p className="px-2 pb-1 text-sm text-ink-soft">Nothing needs attention</p>
      ) : (
        <ul>
          {items.map((item) => {
            const isUnread = unread.has(item.key);
            const line = itemLine(item, fmt);
            return (
              <li key={item.key}>
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
      )}
    </>
  );
}
