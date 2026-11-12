'use client';

/*
 * PROTOTYPE — throwaway. B: no circle at all. The largest part leads as a sentence, then one
 * band split by share, then the parts as wrapping chips.
 */

import Link from 'next/link';
import { percent, type Part } from './parts';

export const VARIANT_B_NAME = 'Share band, leader first';

/** Under this share a segment is too narrow for its percentage. */
const LABEL_FROM = 0.1;

interface VariantProps {
  parts: Part[];
  total: number;
  money: (minor: number) => string;
}

export function VariantB({ parts, money }: VariantProps) {
  const leader = parts[0];
  if (!leader) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        <span className="font-display text-3xl tracking-tight text-ink tabular-nums">
          {percent(leader.share)}
        </span>{' '}
        goes to <span className="font-medium text-ink">{leader.label}</span> · {money(leader.value)}
      </p>
      <div className="flex h-11 w-full gap-0.5 overflow-hidden rounded-xl" aria-hidden>
        {parts.map((part) => (
          <span
            key={part.label}
            className={`flex min-w-1 items-center justify-center text-xs font-medium tabular-nums ${part.value < 0 ? 'bg-hatch' : ''}`}
            style={{
              flexGrow: part.share,
              flexBasis: 0,
              background: part.value < 0 ? undefined : part.color,
              color: part.ink,
            }}
            title={`${part.label}: ${money(part.value)}`}
          >
            {part.share >= LABEL_FROM && part.value >= 0 ? percent(part.share) : ''}
          </span>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {parts.map((part) => {
          const chip = (
            <span className="flex items-center gap-1.5 hover:underline">
              <span
                className={`h-2.5 w-2.5 rounded-sm ${part.value < 0 ? 'bg-hatch' : ''}`}
                style={part.value < 0 ? undefined : { background: part.color }}
              />
              <span>{part.label}</span>
              <span className="text-muted tabular-nums">{percent(part.share)}</span>
              {part.value < 0 && (
                <span className="text-negative tabular-nums">{money(part.value)}</span>
              )}
            </span>
          );
          return (
            <li key={part.label}>{part.href ? <Link href={part.href}>{chip}</Link> : chip}</li>
          );
        })}
      </ul>
    </div>
  );
}
