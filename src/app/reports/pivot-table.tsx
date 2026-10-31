'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import type { Measure, ReportHeader } from '@/server/services/reporting';

/** What the pivot shows: the engine's table, plus where each value drills down to. */
export interface PivotData {
  measure: Measure;
  rows: ReportHeader[];
  columns: ReportHeader[];
  cells: (number | null)[][];
  rowTotals: (number | null)[];
  columnTotals: (number | null)[];
  total: number | null;
  /** Drill-down links, same shape as the values. */
  hrefs: {
    cells: string[][];
    rowTotals: string[];
    columnTotals: string[];
    total: string;
  };
}

const CELL = 'px-3 py-1.5 text-right tabular-nums whitespace-nowrap';
const HEAD = 'px-3 py-1.5 font-medium whitespace-nowrap';

function headerLabel(header: ReportHeader): string {
  return header.isPartial ? `${header.label} (partial)` : header.label;
}

/**
 * The table visualisation and its full-screen pivot view (spec 105). Every value is a link to
 * the Transactions behind it (spec 107).
 */
export function PivotTable({ data, title }: { data: PivotData; title: string }) {
  const fmt = useFormatter();
  const [isFullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!isFullScreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullScreen]);

  const format = (value: number) =>
    data.measure === 'count' ? String(value) : fmt.amount(value, { currency: 'CHF' });

  const valueCell = (value: number | null, href: string, where: string, isTotal = false) => (
    <td className={`${CELL} ${isTotal ? 'font-semibold' : ''}`}>
      {value === null ? (
        <span className="text-zinc-400">—</span>
      ) : (
        <Link
          href={href}
          aria-label={`${where}: ${format(value)}`}
          className={`hover:underline ${value < 0 ? 'text-red-700 dark:text-red-400' : ''}`}
        >
          {format(value)}
        </Link>
      )}
    </td>
  );

  return (
    <section
      aria-label="Pivot report"
      className={
        isFullScreen
          ? 'fixed inset-0 z-50 flex flex-col gap-3 overflow-auto bg-white p-4 dark:bg-zinc-950'
          : 'flex flex-col gap-3'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          type="button"
          onClick={() => setFullScreen(!isFullScreen)}
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {isFullScreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
      {data.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No complete period in this date range yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Pivot" className="text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={`${HEAD} text-left`}></th>
                {data.columns.map((column) => (
                  <th key={column.key ?? 'none'} scope="col" className={`${HEAD} text-right`}>
                    {headerLabel(column)}
                  </th>
                ))}
                {data.columns.length > 1 && (
                  <th scope="col" className={`${HEAD} text-right`}>
                    Total
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {data.rows.map((row, r) => (
                <tr key={row.key ?? 'none'}>
                  <th scope="row" className={`${HEAD} text-left`}>
                    {headerLabel(row)}
                  </th>
                  {data.columns.map((column, c) => (
                    <Fragment key={column.key ?? 'none'}>
                      {valueCell(
                        data.cells[r]![c]!,
                        data.hrefs.cells[r]![c]!,
                        `${row.label}, ${column.label}`,
                      )}
                    </Fragment>
                  ))}
                  {data.columns.length > 1 &&
                    valueCell(
                      data.rowTotals[r]!,
                      data.hrefs.rowTotals[r]!,
                      `${row.label}, Total`,
                      true,
                    )}
                </tr>
              ))}
            </tbody>
            {data.rows.length > 1 && (
              <tfoot className="border-t-2 border-zinc-300 dark:border-zinc-700">
                <tr>
                  <th scope="row" className={`${HEAD} text-left`}>
                    Total
                  </th>
                  {data.columns.map((column, c) => (
                    <Fragment key={column.key ?? 'none'}>
                      {valueCell(
                        data.columnTotals[c]!,
                        data.hrefs.columnTotals[c]!,
                        `Total, ${column.label}`,
                        true,
                      )}
                    </Fragment>
                  ))}
                  {data.columns.length > 1 &&
                    valueCell(data.total, data.hrefs.total, 'Total', true)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
