import { Suspense, type ReactNode } from 'react';
import { PLACEHOLDER_CLASS, SECTION_TITLE_CLASS, TILE_CLASS } from '@/components/surface';
import { SectionErrorBoundary } from './section-error-boundary';

/** Every section's card: a tile that never widens the page (wide content scrolls inside). */
const SECTION_CLASS = `${TILE_CLASS} flex min-w-0 flex-col gap-4`;

interface SectionCardProps {
  name: string;
  className?: string;
  children: ReactNode;
}

/** A loaded section: its card and title. */
export function SectionCard({ name, className = '', children }: SectionCardProps) {
  return (
    <section aria-label={name} className={`${SECTION_CLASS} ${className}`}>
      <h2 className={SECTION_TITLE_CLASS}>{name}</h2>
      {children}
    </section>
  );
}

/** A section while its figures load: its title over a quiet block. */
function SectionPlaceholder({ name, className = '' }: { name: string; className?: string }) {
  return (
    <section aria-label={name} aria-busy="true" className={`${SECTION_CLASS} ${className}`}>
      <h2 className={SECTION_TITLE_CLASS}>{name}</h2>
      <span className="sr-only">Loading</span>
      <div className={`${PLACEHOLDER_CLASS} h-48`} />
    </section>
  );
}

interface StreamedSectionProps {
  name: string;
  /** Analytics at the same Period view, for a failed section's "Try again". */
  retryHref: string;
  /** Grid placement, shared by the placeholder and the loaded card. */
  className?: string;
  /** An async component awaiting the section's figures, rendering a `SectionCard`. */
  children: ReactNode;
}

/**
 * One section of Analytics streamed in on its own: a placeholder until its figures arrive, and
 * its own error boundary, so one slow or failed section holds up nothing else.
 */
export function StreamedSection({ name, retryHref, className, children }: StreamedSectionProps) {
  return (
    <SectionErrorBoundary name={name} retryHref={retryHref}>
      <Suspense fallback={<SectionPlaceholder name={name} className={className} />}>
        {children}
      </Suspense>
    </SectionErrorBoundary>
  );
}
