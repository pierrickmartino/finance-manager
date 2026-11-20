import { Suspense, type ReactNode } from 'react';
import { PLACEHOLDER_CLASS, SECTION_TITLE_CLASS, TILE_CLASS } from '@/components/surface';
import { plural } from '@/lib/reporting/drill-summary';
import { SectionErrorBoundary } from './section-error-boundary';

/** Every section's card: a tile that never widens the page (wide content scrolls inside). */
const SECTION_CLASS = `${TILE_CLASS} flex min-w-0 flex-col gap-4`;

/** What a section's figures leave out for want of an FX rate: Transactions, or Accounts. */
export interface Unconverted {
  count: number;
  /** What is counted; Transactions unless said. */
  of?: 'Transaction' | 'Account';
}

/** The note a section shows when its figures leave something out, as a Dashboard Widget does. */
function UnconvertedNote({ count, of = 'Transaction' }: Unconverted) {
  return <p className="text-sm text-warning">{plural(count, of)} left out: no FX rate yet.</p>;
}

interface SectionCardProps {
  name: string;
  className?: string;
  /** Shown under the title when its count is above zero. */
  unconverted?: Unconverted;
  children: ReactNode;
}

/** A loaded section: its card and title, then what its figures leave out, if anything. */
export function SectionCard({ name, className = '', unconverted, children }: SectionCardProps) {
  return (
    <section aria-label={name} className={`${SECTION_CLASS} ${className}`}>
      <h2 className={SECTION_TITLE_CLASS}>{name}</h2>
      {unconverted && unconverted.count > 0 && <UnconvertedNote {...unconverted} />}
      {children}
    </section>
  );
}

/** A section with nothing to show: why, in a quiet line. */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-sm text-muted">{children}</p>;
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
