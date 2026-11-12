'use client';

/*
 * PROTOTYPE — throwaway. D: a treemap, each part a tile sized by its share, the label on the
 * tile itself (no legend). The tiles are the links.
 */

import Link from 'next/link';
import { percent, type Part } from './parts';

export const VARIANT_D_NAME = 'Treemap tiles';

interface Rect {
  part: Part;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Split the parts in two halves of near-equal share, along the longer side; recurse. */
function layout(parts: Part[], x: number, y: number, w: number, h: number): Rect[] {
  if (parts.length === 0) return [];
  if (parts.length === 1) return [{ part: parts[0]!, x, y, w, h }];
  const whole = parts.reduce((sum, part) => sum + part.share, 0) || 1;
  let acc = 0;
  let cut = 1;
  for (let i = 0; i < parts.length - 1; i++) {
    acc += parts[i]!.share;
    cut = i + 1;
    if (acc >= whole / 2) break;
  }
  const first = parts.slice(0, cut);
  const ratio = first.reduce((sum, part) => sum + part.share, 0) / whole;
  if (w >= h) {
    return [
      ...layout(first, x, y, w * ratio, h),
      ...layout(parts.slice(cut), x + w * ratio, y, w * (1 - ratio), h),
    ];
  }
  return [
    ...layout(first, x, y, w, h * ratio),
    ...layout(parts.slice(cut), x, y + h * ratio, w, h * (1 - ratio)),
  ];
}

interface VariantProps {
  parts: Part[];
  total: number;
  money: (minor: number) => string;
}

export function VariantD({ parts, money }: VariantProps) {
  // Percent of a 100×100 box; each tile insets by half the gap.
  const rects = layout(parts, 0, 0, 100, 100);
  return (
    <div className="relative h-56 w-full">
      {rects.map(({ part, x, y, w, h }) => {
        const isRoomy = w > 18 && h > 34;
        const hasLabel = h > 12;
        const tile = (
          <span
            className={`absolute flex flex-col justify-between overflow-hidden rounded-xl p-2.5 hover:opacity-90 ${part.value < 0 ? 'bg-hatch' : ''}`}
            style={{
              left: `calc(${x}% + 2px)`,
              top: `calc(${y}% + 2px)`,
              width: `calc(${w}% - 4px)`,
              height: `calc(${h}% - 4px)`,
              background: part.value < 0 ? undefined : part.color,
              color: part.value < 0 ? '#ffffff' : part.ink,
            }}
            title={`${part.label}: ${money(part.value)} · ${percent(part.share)}`}
          >
            {hasLabel && <span className="truncate text-xs font-medium">{part.label}</span>}
            {isRoomy && (
              <span>
                <span className="block font-display text-xl leading-none tabular-nums">
                  {percent(part.share)}
                </span>
                <span className="block truncate text-xs tabular-nums opacity-80">
                  {money(part.value)}
                </span>
              </span>
            )}
          </span>
        );
        return part.href ? (
          <Link
            key={part.label}
            href={part.href}
            aria-label={`${part.label}: ${money(part.value)}`}
          >
            {tile}
          </Link>
        ) : (
          <span key={part.label}>{tile}</span>
        );
      })}
    </div>
  );
}
