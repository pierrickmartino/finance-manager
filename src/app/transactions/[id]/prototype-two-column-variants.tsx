/**
 * PROTOTYPE — throwaway. Three 2-column layouts for the Transaction page, switchable via
 * `?variant=` on the existing /transactions/[id] route. `current` is today's 3-column layout,
 * kept for comparison. The panels are the real ones; only their arrangement differs.
 *
 * - A "Do | Know": two equal columns, actions left (Classification, Transfer), facts right
 *   (bank fields, History open); Split full width below.
 * - B "Main + rail": a wide main column for the work (Classification, Split) and a narrow
 *   sticky rail for context (bank fields, Transfer, History).
 * - C "Inspector": a narrow sticky inspector on the left with every edit to the whole
 *   Transaction (Classification, Transfer); a wide canvas on the right to read it (bank
 *   fields, Split, History).
 */

import type { ReactNode } from 'react';
import type { PrototypeVariant } from '@/components/prototype-switcher';

export const TWO_COLUMN_VARIANTS: PrototypeVariant[] = [
  { key: 'A', name: 'Do | Know, 1:1' },
  { key: 'B', name: 'Main + sticky rail, 2:1' },
  { key: 'C', name: 'Inspector left, 1:2' },
  { key: 'current', name: 'Today, 3 columns' },
];

export function readVariant(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return TWO_COLUMN_VARIANTS.some((variant) => variant.key === value) ? (value as string) : 'A';
}

export interface TransactionPanels {
  classification: ReactNode;
  transfer: ReactNode;
  bank: ReactNode;
  /** History folded, as today. */
  history: ReactNode;
  /** History unfolded, for a column that has the room. */
  historyOpen: ReactNode;
  split: ReactNode;
}

const STICKY = 'lg:sticky lg:top-5';

export function VariantA({ panels }: { panels: TransactionPanels }) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {panels.classification}
          {panels.transfer}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {panels.bank}
          {panels.historyOpen}
        </div>
      </div>
      {panels.split}
    </>
  );
}

export function VariantB({ panels }: { panels: TransactionPanels }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        {panels.classification}
        {panels.split}
      </div>
      <aside aria-label="Context" className={`flex min-w-0 flex-col gap-5 ${STICKY}`}>
        {panels.bank}
        {panels.transfer}
        {panels.history}
      </aside>
    </div>
  );
}

export function VariantC({ panels }: { panels: TransactionPanels }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <aside aria-label="Inspector" className={`flex min-w-0 flex-col gap-5 ${STICKY}`}>
        {panels.classification}
        {panels.transfer}
      </aside>
      <div className="flex min-w-0 flex-col gap-5">
        {panels.bank}
        {panels.split}
        {panels.historyOpen}
      </div>
    </div>
  );
}

/** Today's layout, unchanged, for comparison. */
export function VariantCurrent({ panels }: { panels: TransactionPanels }) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-3">
        {panels.classification}
        {panels.transfer}
        {panels.bank}
      </div>
      {panels.history}
      {panels.split}
    </>
  );
}

export function TwoColumnVariant({
  variant,
  panels,
}: {
  variant: string;
  panels: TransactionPanels;
}) {
  if (variant === 'B') return <VariantB panels={panels} />;
  if (variant === 'C') return <VariantC panels={panels} />;
  if (variant === 'current') return <VariantCurrent panels={panels} />;
  return <VariantA panels={panels} />;
}
