'use client';

/*
 * PROTOTYPE — throwaway. Variant A, "Heatmap": the whole pivot as a grid of navy cells whose
 * depth is the value's size, rows ranked by total. Every cell is still a link and carries its
 * amount as text.
 */

import Link from 'next/link';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { maxAbs, rankedRows, shortLabel, useValueFormat } from './helpers';

export function HeatmapTable({ data }: { data: ChartSource }) {
  const format = useValueFormat(data);
  const order = rankedRows(data);
  const max = maxAbs(data.cells.flat());
  const hasTotal = data.columns.length > 1;
  const template = `minmax(6rem, 1.4fr) repeat(${data.columns.length}, minmax(3.25rem, 1fr))${hasTotal ? ' minmax(4.5rem, 1fr)' : ''}`;

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-1 text-xs" style={{ gridTemplateColumns: template }}>
        <span />
        {data.columns.map((column) => (
          <span key={column.key ?? 'none'} className="px-1 text-center text-muted">
            {shortLabel(column)}
          </span>
        ))}
        {hasTotal && <span className="px-1 text-right text-muted">Total</span>}

        {order.map((r) => {
          const row = data.rows[r]!;
          return (
            <div key={row.key ?? 'none'} className="contents">
              <span className="truncate py-2 pr-2 font-medium" title={row.label}>
                {row.label}
              </span>
              {data.columns.map((column, c) => {
                const value = data.cells[r]?.[c] ?? null;
                if (value === null)
                  return <span key={column.key ?? 'none'} className="rounded-md bg-sunken/60" />;
                const depth = Math.abs(value) / max;
                return (
                  <Link
                    key={column.key ?? 'none'}
                    href={data.hrefs.cells[r]![c]!}
                    title={`${row.label}, ${column.label}: ${format(value)}`}
                    className={`flex items-center justify-center rounded-md px-1 tabular-nums hover:ring-2 hover:ring-accent ${depth > 0.45 ? 'text-on-hero' : 'text-ink'} ${column.isPartial ? 'outline-2 -outline-offset-2 outline-dashed outline-hero-deep' : ''}`}
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--color-hero-mid) ${Math.round(8 + depth * 92)}%, var(--color-surface))`,
                    }}
                  >
                    {compact(value)}
                  </Link>
                );
              })}
              {hasTotal && (
                <Link
                  href={data.hrefs.rowTotals[r]!}
                  className="py-2 text-right font-semibold tabular-nums hover:underline"
                >
                  {data.rowTotals[r] === null ? '—' : format(data.rowTotals[r]!)}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span className="h-2 w-16 rounded-full bg-gradient-to-r from-hero-mist to-hero-mid" />
        Deeper is larger · dashed, * partial period
      </p>
    </div>
  );
}

/** 2150.00 CHF → "2.2k": cells are narrow; the full amount is in the title. */
function compact(minor: number): string {
  const whole = Math.abs(minor / 100);
  return whole >= 1000 ? `${(whole / 1000).toFixed(1)}k` : String(Math.round(whole));
}
