'use client';

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Icon } from './icon';
import { Sidebar } from './sidebar';
import { sidebarModeCookie, type SidebarMode } from './sidebar-mode';

/** Long enough that sweeping the pointer across the rail on the way elsewhere doesn't open it. */
const PEEK_DELAY_MS = 150;

const PIN_BUTTON = 'grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-sunken';
const PIN_ON = 'text-accent-ink';
const PIN_OFF = 'text-faint hover:text-ink';

interface DesktopSidebarProps {
  /** The mode saved in the sidebar cookie, read by the server so the first paint is right. */
  initialMode: SidebarMode;
}

/**
 * The sidebar from `md` up. Pinned, it sits beside the page. Unpinned, it shrinks to a rail of
 * icons that peeks open over the page while the pointer is on it or focus is inside it; Escape
 * or following a link closes the peek. The pin saves the choice in a cookie.
 */
export function DesktopSidebar({ initialMode }: DesktopSidebarProps) {
  const [mode, setMode] = useState(initialMode);
  const [isPeeking, setIsPeeking] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinned = mode === 'pinned';
  const isOpen = isPinned || isPeeking;

  function cancelPeekTimer() {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = null;
  }

  function peekSoon() {
    if (isPinned) return;
    cancelPeekTimer();
    peekTimer.current = setTimeout(() => setIsPeeking(true), PEEK_DELAY_MS);
  }

  function closePeek() {
    cancelPeekTimer();
    setIsPeeking(false);
  }

  function togglePin() {
    const next: SidebarMode = isPinned ? 'rail' : 'pinned';
    document.cookie = sidebarModeCookie(next);
    setMode(next);
    closePeek();
  }

  function onFocus() {
    if (isPinned) return;
    cancelPeekTimer();
    setIsPeeking(true);
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) closePeek();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && isPeeking) closePeek();
  }

  useEffect(() => cancelPeekTimer, []);

  return (
    <aside
      data-testid="sidebar"
      data-state={isPinned ? 'pinned' : isPeeking ? 'peeking' : 'rail'}
      className={`sticky top-0 z-30 hidden h-screen shrink-0 md:block motion-safe:transition-[width] motion-safe:duration-200 ${isPinned ? 'w-64' : 'w-16'}`}
    >
      <div
        onMouseEnter={peekSoon}
        onMouseLeave={closePeek}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={`absolute inset-y-0 left-0 overflow-hidden border-r border-rule bg-surface motion-safe:transition-[width,box-shadow] motion-safe:duration-200 ${isOpen ? 'w-64' : 'w-16'} ${isPeeking && !isPinned ? 'shadow-2xl' : ''}`}
      >
        <div className="h-full w-64">
          <Sidebar
            isRail={!isOpen}
            onNavigate={closePeek}
            headerAction={
              <button
                type="button"
                aria-label="Pin menu"
                aria-pressed={isPinned}
                title={isPinned ? 'Unpin: collapse to icons' : 'Pin: keep the menu open'}
                onClick={togglePin}
                className={`${PIN_BUTTON} ${isPinned ? PIN_ON : PIN_OFF}`}
              >
                <Icon name="pin" />
              </button>
            }
          />
        </div>
      </div>
    </aside>
  );
}
