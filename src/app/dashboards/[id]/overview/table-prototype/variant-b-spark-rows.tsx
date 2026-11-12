'use client';

/*
 * PROTOTYPE — throwaway. Variant B, "Spark rows": no grid at all. Each row is a line of its own:
 * name and total, a strip of small bars (one per column, all on one scale) and how the latest
 * full column compares with the one before.
 */

import Link from 'next/link';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { latestFullIndex } from '@/lib/reporting/overview';
import { maxAbs, rankedRows, shortLabel, useValueFormat } from './helpers';

export function SparkRows({ data }: { data: ChartSource }) {
  const format = useValueFormat(data);
  const latest = latestFullIndex(data.columns);
  const hasSeries = data.columns.length > 1;

  return (
    <ul className="flex flex-col divide-y divide-rule">
      {rankedRows(data).map((r) => {
        const row = data.rows[r]!;
        const cells = data.cells[r] ?? [];
        // Each row on its own scale: the strip shows the row's shape, the total its size.
        const max = maxAbs(cells);
        const now = cells[latest] ?? null;
        const before = latest > 0 ? (cells[latest - 1] ?? null) : null;
        const change =
          now !== null && before !== null && before !== 0
            ? (Math.abs(now) - Math.abs(before)) / Math.abs(before)
            : null;
        return (
          <li key={row.key ?? 'none'} className="py-2.5">
            <Link
              href={data.hrefs.rowTotals[r]!}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-lg hover:bg-paper"
            >
              <span className="truncate font-medium">{row.label}</span>
              <span className="text-right font-display text-lg tabular-nums">
                {data.rowTotals[r] === null ? '—' : format(data.rowTotals[r]!)}
              </span>
              {hasSeries && (
                <>
                  <span className="flex h-6 items-end gap-1" aria-hidden>
                    {data.columns.map((column, c) => {
                      const value = cells[c] ?? null;
                      return (
                        <span
                          key={column.key ?? 'none'}
                          title={`${column.label}: ${value === null ? '—' : format(value)}`}
                          className={`flex-1 rounded-sm ${column.isPartial ? 'bg-hatch' : c === latest ? 'bg-hero-deep' : 'bg-hero-mist'}`}
                          style={{
                            height:
                              value === null ? 2 : `${Math.max(8, (Math.abs(value) / max) * 100)}%`,
                          }}
                        />
                      );
                    })}
                  </span>
                  <span className="text-right text-xs text-muted tabular-nums">
                    {change === null
                      ? `${shortLabel(data.columns[latest]!)} —`
                      : `${shortLabel(data.columns[latest]!)} ${change >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(change * 100))}%`}
                  </span>
                </>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
