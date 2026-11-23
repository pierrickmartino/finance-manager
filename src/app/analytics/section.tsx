import { Suspense, type ReactNode } from 'react';
import { PLACEHOLDER_CLASS, SECTION_TITLE_CLASS } from '@/components/surface';
import { plural } from '@/lib/reporting/drill-summary';
import { SectionErrorBoundary } from './section-error-boundary';
import { SECTION_CLASS, sectionFrameClass } from './section-frame';

/** What a section's figures leave out for want of an FX rate: Transactions, or Accounts. */
export interface Unconverted {
  count: number;
  /** What is counted; Transactions unless said. */
  counted?: 'Transaction' | 'Account';
}

/** The note a section shows when its figures leave something out, as a Dashboard Widget does. */
export function UnconvertedNote({ count, counted = 'Transaction' }: Unconverted) {
  return <p className="text-sm text-warning">{plural(count, counted)} left out: no FX rate yet.</p>;
}

interface SectionCardProps {
  name: string;
  className?: string;
  /** Shown under the title when its count is above zero. */
  unconverted?: Unconverted;
  /** Drawn beside the title: a pinnable Card's Period mark and dropdown. */
  titleAside?: ReactNode;
  children: ReactNode;
}

/** A loaded section: its card and title, then what its figures leave out, if anything. */
export function SectionCard({
  name,
  className = '',
  unconverted,
  titleAside,
  children,
}: SectionCardProps) {
  const title = <h2 className={SECTION_TITLE_CLASS}>{name}</h2>;
  return (
    <section aria-label={name} className={`${SECTION_CLASS} ${className}`}>
      {titleAside ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {title}
          {titleAside}
        </div>
      ) : (
        title
      )}
      {unconverted && unconverted.count > 0 && <UnconvertedNote {...unconverted} />}
      {children}
    </section>
  );
}

/** A section with nothing to show: why, in a quiet line. */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-sm text-muted">{children}</p>;
}

interface SectionPlaceholderProps {
  name: string;
  className?: string;
  isCard: boolean;
}

/** A section while its figures load: its title over a quiet block. */
function SectionPlaceholder({ name, className = '', isCard }: SectionPlaceholderProps) {
  return (
    <section
      aria-label={name}
      aria-busy="true"
      className={`${sectionFrameClass(isCard)} ${className}`}
    >
      <h2 className={SECTION_TITLE_CLASS}>{name}</h2>
      <span className="sr-only">Loading</span>
      <div className={`${PLACEHOLDER_CLASS} h-48`} />
    </section>
  );
}

interface StreamedSectionProps {
  name: string;
  /** Analytics over the same Period, for a failed section's "Try again". */
  retryHref: string;
  /** Grid placement, shared by the placeholder and the loaded card. */
  className?: string;
  /** Stands in while the figures load; by default the section's title over a quiet block. */
  placeholder?: ReactNode;
  /**
   * The section is drawn as a Widget's Card (a `CardSection`): its placeholder and error
   * boundary are Card frames too (`WIDGET_CARD_CLASS`), not plain tiles.
   */
  isCard?: boolean;
  /** An async component awaiting the section's figures, rendering a `SectionCard`. */
  children: ReactNode;
}

/**
 * One section of Analytics streamed in on its own: a placeholder until its figures arrive, and
 * its own error boundary, so one slow or failed section holds up nothing else.
 */
export function StreamedSection({
  name,
  retryHref,
  className,
  placeholder,
  isCard = false,
  children,
}: StreamedSectionProps) {
  return (
    <SectionErrorBoundary name={name} retryHref={retryHref} isCard={isCard}>
      <Suspense
        fallback={
          placeholder ?? <SectionPlaceholder name={name} className={className} isCard={isCard} />
        }
      >
        {children}
      </Suspense>
    </SectionErrorBoundary>
  );
}
