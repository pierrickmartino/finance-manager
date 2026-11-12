'use client';

/*
 * PROTOTYPE — throwaway. Variant C, "One column at a time": the card shows a single column of
 * the pivot (the latest full period by default, or the Total) as a ranked bar list; pills switch
 * the column. Trades the grid's overview for a readable answer to "where did it go in Oct?".
 */

import Link from 'next/link';
import { useState } from 'react';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { latestFullIndex } from '@/lib/reporting/overview';
import { maxAbs, shortLabel, useValueFormat } from './helpers';

const TOTAL = -1;

export function FocusColumn({ data }: { data: ChartSource }) {
  const format = useValueFormat(data);
  const hasSeries = data.columns.length > 1;
  const [column, setColumn] = useState(hasSeries ? latestFullIndex(data.columns) : 0);

  const valueAt = (r: number) =>
    column === TOTAL ? (data.rowTotals[r] ?? null) : (data.cells[r]?.[column] ?? null);
  const hrefAt = (r: number) =>
    column === TOTAL ? data.hrefs.rowTotals[r]! : data.hrefs.cells[r]![column]!;
  const order = data.rows
    .map((_, r) => r)
    .filter((r) => valueAt(r) !== null)
    .sort((a, b) => Math.abs(valueAt(b)!) - Math.abs(valueAt(a)!));
  const max = maxAbs(order.map(valueAt));
  const whole = column === TOTAL ? data.total : (data.columnTotals[column] ?? null);

  return (
    <div className="flex flex-col gap-3">
      {hasSeries && (
        <div role="tablist" className="flex flex-wrap gap-1">
          {[
            ...data.columns.map((header, c) => ({ c, label: shortLabel(header) })),
            { c: TOTAL, label: 'Total' },
          ].map(({ c, label }) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === column}
              onClick={() => setColumn(c)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${c === column ? 'bg-hero-deep text-on-hero' : 'bg-paper text-ink-soft hover:bg-sunken'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted">
        {column === TOTAL ? 'Whole range' : data.columns[column]!.label}:{' '}
        <span className="font-medium text-ink tabular-nums">
          {whole === null ? '—' : format(whole)}
        </span>
      </p>
      <ol className="flex flex-col gap-2">
        {order.map((r) => {
          const value = valueAt(r)!;
          return (
            <li key={data.rows[r]!.key ?? 'none'}>
              <Link href={hrefAt(r)} className="group block">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{data.rows[r]!.label}</span>
                  <span className="tabular-nums">{format(value)}</span>
                </span>
                <span className="mt-1 block h-2 rounded-full bg-sunken">
                  <span
                    className="block h-full rounded-full bg-hero-mid group-hover:bg-hero-deep"
                    style={{ width: `${(Math.abs(value) / max) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
