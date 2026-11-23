'use client';

import { Component, type ReactNode } from 'react';
import { SECTION_TITLE_CLASS, SMALL_BUTTON_CLASS } from '@/components/surface';
import { sectionFrameClass } from './section-frame';

interface SectionErrorBoundaryProps {
  /** The section's name, so the failed section still says which it is. */
  name: string;
  /** Analytics over the same Span, to load again. */
  retryHref: string;
  /** The section is drawn as a Widget's Card: it fails in a Card frame (`WIDGET_CARD_CLASS`). */
  isCard: boolean;
  children: ReactNode;
}

/**
 * Keeps one Analytics section's unexpected failure inside its own card: it says it couldn't
 * load, with a way to try again, and the rest of the page keeps working.
 */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  { hasFailed: boolean }
> {
  state = { hasFailed: false };

  static getDerivedStateFromError(): { hasFailed: boolean } {
    return { hasFailed: true };
  }

  render(): ReactNode {
    if (!this.state.hasFailed) return this.props.children;
    return (
      <section aria-label={this.props.name} className={sectionFrameClass(this.props.isCard)}>
        <h2 className={SECTION_TITLE_CLASS}>{this.props.name}</h2>
        <p role="alert" className="text-sm text-negative">
          Couldn&apos;t load this section.
        </p>
        {/* A plain <a>, not client navigation: the whole page loads again. */}
        <a href={this.props.retryHref} className={`${SMALL_BUTTON_CLASS} self-start`}>
          Try again
        </a>
      </section>
    );
  }
}
