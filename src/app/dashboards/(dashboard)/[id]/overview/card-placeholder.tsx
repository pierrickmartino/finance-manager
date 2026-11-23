import type { CSSProperties } from 'react';
import { PLACEHOLDER_CLASS, TILE_CLASS, WIDGET_CARD_CLASS } from '@/components/surface';
import type { PlaceholderShape } from '@/lib/reporting/card';
import { CARD_LEAD_SIZE_CLASS, RING, RING_LAYOUT_CLASS, RING_LIST_CLASS } from './card-layout';

/** The quiet mark standing in for a card's chart, shaped like the one it will draw. */
function ShapeMark({ shape }: { shape: PlaceholderShape }) {
  switch (shape) {
    case 'number':
      return <div className={`${PLACEHOLDER_CLASS} h-12 w-2/5`} />;
    case 'ring':
      // The Card's ring and list, laid out as on the Card (card-layout.ts).
      return (
        <div className={RING_LAYOUT_CLASS}>
          <div
            data-testid="ring"
            className={`${PLACEHOLDER_CLASS} grid shrink-0 place-items-center rounded-full`}
            style={{ width: RING.size, height: RING.size }}
          >
            <div
              className="rounded-full bg-surface"
              style={{ width: RING.inner * 2, height: RING.inner * 2 }}
            />
          </div>
          <TickRows count={3} className={`${RING_LIST_CLASS} gap-3`} testId="ring-list" />
        </div>
      );
    case 'ticks':
      return <TickRows count={4} className="flex flex-1 flex-col gap-3" />;
    case 'grid':
      return (
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 18 }, (_, i) => (
            <div key={i} className={`${PLACEHOLDER_CLASS} h-6`} />
          ))}
        </div>
      );
    case 'bars':
      return (
        <div className="flex h-24 items-end gap-1.5">
          {[45, 70, 55, 85, 60, 75, 50, 65].map((height, i) => (
            <div
              key={i}
              className={`${PLACEHOLDER_CLASS} flex-1`}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      );
  }
}

interface TickRowsProps {
  count: number;
  /** How the rows lay out where they stand (alone, or as a ring's list). */
  className: string;
  testId?: string;
}

function TickRows({ count, className, testId }: TickRowsProps) {
  return (
    <div className={className} data-testid={testId}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${PLACEHOLDER_CLASS} h-4`} style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

interface WidgetCardPlaceholderProps {
  /** The Widget's name: known before its query runs, so the card is already recognisable. */
  name: string;
  shape: PlaceholderShape;
  /** Its height where cards read as one column; on the board it fills its cell. */
  height: number;
}

/**
 * A Widget's card while its query runs on the Dashboard Story: its real name over a quiet mark
 * shaped like its chart, as tall as the card will be, so the board doesn't jump when it arrives.
 */
export function WidgetCardPlaceholder({ name, shape, height }: WidgetCardPlaceholderProps) {
  return (
    <section
      aria-label={name}
      aria-busy="true"
      className={`${WIDGET_CARD_CLASS} flex h-(--placeholder-height) flex-col gap-4 overflow-hidden lg:h-full`}
      style={{ '--placeholder-height': `${height}px` } as CSSProperties}
    >
      <div>
        <h2 className="font-medium">{name}</h2>
        {/* The headline and the lead figure, each a line of the Card's own height. The lead's
            block takes the lead's size, so its line (`lh`) is the lead figure's line. */}
        <div className={`${PLACEHOLDER_CLASS} mt-1.5 mb-0.5 h-4 w-3/5`} />
        <div
          data-testid="card-lead"
          className={`${PLACEHOLDER_CLASS} ${CARD_LEAD_SIZE_CLASS} my-[0.15lh] h-[0.7lh] w-2/5`}
        />
        <span className="sr-only">Loading</span>
      </div>
      <ShapeMark shape={shape} />
    </section>
  );
}

/** One of the overview row's cards while it loads: a tile of the overview's own size. */
export function TilePlaceholder({ label, className = '' }: { label: string; className?: string }) {
  return (
    <section
      aria-label={label}
      aria-busy="true"
      className={`${TILE_CLASS} flex min-h-56 flex-col gap-3 ${className}`}
    >
      <span className="sr-only">Loading</span>
      <div className={`${PLACEHOLDER_CLASS} h-4 w-2/5`} />
      <div className={`${PLACEHOLDER_CLASS} h-10 w-3/5`} />
      <div className={`${PLACEHOLDER_CLASS} mt-auto h-16`} />
    </section>
  );
}
