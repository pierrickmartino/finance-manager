'use client';

/*
 * PROTOTYPE — throwaway. C: a 10×10 waffle, one square per percent (largest remainder, so it
 * always fills 100); hover a part to light only its squares.
 */

import Link from 'next/link';
import { useState } from 'react';
import { type Part } from './parts';

export const VARIANT_C_NAME = 'Waffle, one square per percent';

const CELLS = 100;

/** Whole squares per part, summing to exactly 100 (largest remainder). */
function squares(parts: Part[]): number[] {
  const exact = parts.map((part) => part.share * CELLS);
  const counts = exact.map(Math.floor);
  const left = CELLS - counts.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((value, i) => ({ i, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (let k = 0; k < left; k++) counts[byRemainder[k % byRemainder.length]!.i]! += 1;
  return counts;
}

interface VariantProps {
  parts: Part[];
  total: number;
  money: (minor: number) => string;
}

export function VariantC({ parts, total, money }: VariantProps) {
  const [active, setActive] = useState<number | null>(null);
  const counts = squares(parts);
  const cells = counts.flatMap((count, i) => Array.from({ length: count }, () => i));
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="grid w-44 shrink-0 grid-cols-10 gap-1" aria-hidden>
        {cells.map((owner, k) => {
          const part = parts[owner]!;
          return (
            <span
              key={k}
              className={`aspect-square rounded-[3px] transition-opacity ${part.value < 0 ? 'bg-hatch' : ''}`}
              style={{
                background: part.value < 0 ? undefined : part.color,
                opacity: active === null || active === owner ? 1 : 0.15,
              }}
              onMouseEnter={() => setActive(owner)}
              onMouseLeave={() => setActive(null)}
            />
          );
        })}
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-3">
        <p className="text-xs text-muted">
          Each square is 1% of <span className="text-ink tabular-nums">{money(total)}</span>
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {parts.map((part, i) => {
            const row = (
              <span
                className={`flex items-baseline gap-2 rounded-md px-1.5 py-0.5 ${active === i ? 'bg-sunken' : ''}`}
              >
                <span className="w-8 font-medium tabular-nums">{counts[i]}</span>
                <span className="flex-1 truncate">{part.label}</span>
                <span className="text-muted tabular-nums">{money(part.value)}</span>
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
    </div>
  );
}
