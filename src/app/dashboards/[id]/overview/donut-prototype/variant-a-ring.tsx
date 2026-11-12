'use client';

/* PROTOTYPE — throwaway. A: a real ring, the total in its hole; hover a slice or row to read it. */

import Link from 'next/link';
import { useState } from 'react';
import { percent, type Part } from './parts';

export const VARIANT_A_NAME = 'Ring with centre readout';

const SIZE = 160;
const R_OUTER = 78;
const R_INNER = 52;
const GAP = 0.012; // radians between slices

function arc(start: number, end: number): string {
  const point = (r: number, a: number) =>
    // Rounded so the server's and the browser's floats print the same path (hydration).
    `${(SIZE / 2 + r * Math.sin(a)).toFixed(2)},${(SIZE / 2 - r * Math.cos(a)).toFixed(2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M${point(R_OUTER, start)}`,
    `A${R_OUTER},${R_OUTER} 0 ${large} 1 ${point(R_OUTER, end)}`,
    `L${point(R_INNER, end)}`,
    `A${R_INNER},${R_INNER} 0 ${large} 0 ${point(R_INNER, start)}`,
    'Z',
  ].join(' ');
}

interface VariantProps {
  parts: Part[];
  total: number;
  money: (minor: number) => string;
}

export function VariantA({ parts, total, money }: VariantProps) {
  const [active, setActive] = useState<number | null>(null);
  const shown = active === null ? null : parts[active];
  const slices = parts.map((part, i) => {
    const start = parts.slice(0, i).reduce((sum, p) => sum + p.share, 0) * Math.PI * 2;
    const end = start + part.share * Math.PI * 2;
    const isWhole = part.share >= 0.999;
    return { part, d: isWhole ? null : arc(start + GAP / 2, end - GAP / 2) };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative mx-auto shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" aria-hidden>
          {slices.map(({ part, d }, i) =>
            d === null ? (
              <circle
                key={part.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={(R_OUTER + R_INNER) / 2}
                fill="none"
                stroke={part.color}
                strokeWidth={R_OUTER - R_INNER}
              />
            ) : (
              <path
                key={part.label}
                d={d}
                fill={part.color}
                opacity={active === null || active === i ? 1 : 0.25}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                strokeDasharray={part.value < 0 ? '3 2' : undefined}
                stroke={part.value < 0 ? '#be123c' : 'none'}
                strokeWidth={part.value < 0 ? 1.5 : 0}
              />
            ),
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-24 truncate text-xs text-muted">
            {shown ? shown.label : 'Total'}
          </span>
          <span className="font-display text-lg tracking-tight tabular-nums">
            {money(shown ? shown.value : total)}
          </span>
          {shown && <span className="text-xs text-muted">{percent(shown.share)}</span>}
        </div>
      </div>
      <ul className="flex min-w-48 flex-1 flex-col">
        {parts.map((part, i) => {
          const row = (
            <span
              className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${active === i ? 'bg-sunken' : ''}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: part.color }} />
              <span className="truncate">{part.label}</span>
              <span className="text-muted tabular-nums">{money(part.value)}</span>
              <span className="w-9 text-right tabular-nums">{percent(part.share)}</span>
            </span>
          );
          return (
            <li
              key={part.label}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {part.href ? (
                <Link href={part.href} className="block">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
