'use client';

/** PROTOTYPE (throwaway): money formatting shared by the variants. Values are minor units. */
import { useMemo } from 'react';
import { useFormatter } from '@/components/formatter-provider';

export interface Money {
  /** "CHF 12'345" */
  whole: (minor: number) => string;
  /** "12.3k" for axes and tight labels. */
  compact: (minor: number) => string;
  /** Major units, for animated numbers. */
  major: (minor: number) => number;
}

export function useMoney(): Money {
  const fmt = useFormatter();
  return useMemo(
    () => ({
      whole: (minor) => fmt.amount(Math.round(minor), { currency: 'CHF', isWhole: true }),
      compact: (minor) => {
        const major = minor / 100;
        const abs = Math.abs(major);
        if (abs >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000) return `${(major / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
        return String(Math.round(major));
      },
      major: (minor) => Math.round(minor / 100),
    }),
    [fmt],
  );
}

/** NumberFlow format for whole Swiss francs. */
export const CHF_FORMAT = {
  style: 'currency',
  currency: 'CHF',
  maximumFractionDigits: 0,
} as const;
