import type { CSSProperties } from 'react';
import { PLACEHOLDER_CLASS, TILE_CLASS, WIDGET_CARD_CLASS } from '@/components/surface';
import type { PlaceholderShape } from '@/lib/reporting/card';

/** The quiet mark standing in for a card's chart, shaped like the one it will draw. */
function ShapeMark({ shape }: { shape: PlaceholderShape }) {
  switch (shape) {
    case 'number':
      return <div className={`${PLACEHOLDER_CLASS} h-12 w-2/5`} />;
    case 'ring':
      // The ring's size, and its list below it under @md and beside it from @md, as on the Card.
      return (
        <div className="flex flex-col items-center gap-6 @md:flex-row">
          <div
            className={`${PLACEHOLDER_CLASS} grid size-40 shrink-0 place-items-center rounded-full`}
          >
            <div className="size-26 rounded-full bg-surface" />
          </div>
          <TickRows count={3} className="w-full @md:w-auto" />
        </div>
      );
    case 'ticks':
      return <TickRows count={4} />;
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

function TickRows({ count, className = '' }: { count: number; className?: string }) {
  return (
    <div className={`flex flex-1 flex-col gap-3 ${className}`}>
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
        {/* The headline and the lead figure, each a line of the Card's own height: the lead's
            line a size down under @md, full from @md, as the Card's lead (widget-card.tsx). */}
        <div className={`${PLACEHOLDER_CLASS} mt-1.5 mb-0.5 h-4 w-3/5`} />
        <div className={`${PLACEHOLDER_CLASS} my-1 h-5 w-2/5 @md:h-7`} />
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
