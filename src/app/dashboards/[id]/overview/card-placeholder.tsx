import type { CSSProperties } from 'react';
import { CARD_CLASS, PLACEHOLDER_CLASS, TILE_CLASS } from '@/components/surface';
import type { PlaceholderShape } from '@/lib/reporting/placeholder';

/** The quiet mark standing in for a card's chart, shaped like the one it will draw. */
function ShapeMark({ shape }: { shape: PlaceholderShape }) {
  switch (shape) {
    case 'number':
      return <div className={`${PLACEHOLDER_CLASS} h-12 w-2/5`} />;
    case 'ring':
      return (
        <div className="flex items-center gap-4">
          <div
            className={`${PLACEHOLDER_CLASS} grid size-28 shrink-0 place-items-center rounded-full`}
          >
            <div className="size-16 rounded-full bg-surface" />
          </div>
          <TickRows count={3} />
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

function TickRows({ count }: { count: number }) {
  return (
    <div className="flex flex-1 flex-col gap-3">
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
      className={`${TILE_CLASS} flex h-(--placeholder-height) flex-col gap-4 overflow-hidden lg:h-full`}
      style={{ '--placeholder-height': `${height}px` } as CSSProperties}
    >
      <div>
        <h2 className="font-medium">{name}</h2>
        <div className={`${PLACEHOLDER_CLASS} mt-2 h-4 w-3/5`} />
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

/** The Completeness check while it runs: one notice line, as tall as its closed headline. */
export function NoticePlaceholder() {
  return (
    <section
      aria-label="Completeness check"
      aria-busy="true"
      className={`${CARD_CLASS} px-5 py-2.5 text-sm`}
    >
      <span className="sr-only">Loading</span>
      <div className={`${PLACEHOLDER_CLASS} h-5 w-1/2`} />
    </section>
  );
}
