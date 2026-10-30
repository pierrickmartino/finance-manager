'use client';

import { useFormatter } from '@/components/formatter-provider';

const SAMPLE_AMOUNT_MINOR = -123456789;
const SAMPLE_DATE = '2025-12-31';

/** Renders sample values through the shared formatter, so the user sees the effect of a change. */
export function FormatPreview() {
  const fmt = useFormatter();
  return (
    <section
      aria-label="Preview"
      className="rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-zinc-500">Amount</dt>
        <dd className="tabular-nums">{fmt.amount(SAMPLE_AMOUNT_MINOR, { currency: 'CHF' })}</dd>
        <dt className="text-zinc-500">Date</dt>
        <dd>{fmt.date(SAMPLE_DATE)}</dd>
      </dl>
    </section>
  );
}
