'use client';

import { usePathname } from 'next/navigation';
import { Component, type ReactNode } from 'react';
import { SMALL_BUTTON_CLASS, TILE_CLASS } from '@/components/surface';

interface CardErrorBoundaryProps {
  /** The Widget's name, so the failed card still says which Widget it is. */
  name: string;
  children: ReactNode;
}

/**
 * Keeps one Widget's unexpected failure inside its own card: the card says it couldn't load,
 * with a way to try again, and the rest of the Dashboard Story keeps working. A Widget whose
 * query reports a known problem doesn't get here: its card shows that message itself.
 */
export class CardErrorBoundary extends Component<CardErrorBoundaryProps, { hasFailed: boolean }> {
  state = { hasFailed: false };

  static getDerivedStateFromError(): { hasFailed: boolean } {
    return { hasFailed: true };
  }

  render(): ReactNode {
    if (!this.state.hasFailed) return this.props.children;
    return (
      <section
        aria-label={this.props.name}
        className={`${TILE_CLASS} flex flex-col gap-2 lg:h-full`}
      >
        <h2 className="font-medium">{this.props.name}</h2>
        <p role="alert" className="text-sm text-negative">
          Couldn&apos;t load this Widget.
        </p>
        <RetryLink />
      </section>
    );
  }
}

/** Reloads the page in full (a plain `<a>`, not client navigation), running every query again. */
function RetryLink() {
  const pathname = usePathname();
  return (
    <a href={pathname} className={`${SMALL_BUTTON_CLASS} self-start`}>
      Try again
    </a>
  );
}
