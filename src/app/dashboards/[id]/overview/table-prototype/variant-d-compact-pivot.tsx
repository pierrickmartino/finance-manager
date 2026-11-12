'use client';

/*
 * PROTOTYPE — throwaway. Variant D, "Trimmed pivot": still a real table, cut to what a card can
 * hold: the largest rows (the rest folded into one "n more" row), the latest columns, totals,
 * and a way out to the full pivot. The finance-sheet answer.
 */

import Link from 'next/link';
import { Fragment } from 'react';
import type { ChartSource } from '@/lib/reporting/chart-data';
import { rankedRows, shortLabel, useValueFormat } from './helpers';

const ROW_LIMIT = 5;
const COLUMN_LIMIT = 3;

const CELL = 'px-2 py-1.5 text-right tabular-nums whitespace-nowrap';

function sum(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

export function CompactPivot({ data, widgetId }: { data: ChartSource; widgetId: string }) {
  const format = useValueFormat(data);
  const order = rankedRows(data);
  const shown = order.slice(0, ROW_LIMIT);
  const folded = order.slice(ROW_LIMIT);
  const firstColumn = Math.max(0, data.columns.length - COLUMN_LIMIT);
  const columns = data.columns.map((_, c) => c).slice(firstColumn);
  const hasTotal = data.columns.length > 1;

  const cell = (value: number | null, href?: string, strong = false) => (
    <td className={`${CELL} ${strong ? 'font-semibold' : ''} `}>
      {value === null ? (
        <span className="text-faint">—</span>
      ) : href ? (
        <Link href={href} className="hover:underline">
          {format(value)}
        </Link>
      ) : (
        format(value)
      )}
    </td>
  );

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="py-1.5 pr-2 text-left font-normal">
              {firstColumn > 0 ? `+${firstColumn} earlier` : ''}
            </th>
            {columns.map((c) => (
              <th key={c} className="px-2 py-1.5 text-right font-normal">
                {shortLabel(data.columns[c]!)}
              </th>
            ))}
            {hasTotal && (
              <th className="px-2 py-1.5 text-right font-medium text-ink-soft">Total</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {shown.map((r) => (
            <tr key={data.rows[r]!.key ?? 'none'} className="hover:bg-paper">
              <th scope="row" className="max-w-40 truncate py-1.5 pr-2 text-left font-medium">
                {data.rows[r]!.label}
              </th>
              {columns.map((c) => (
                <Fragment key={c}>
                  {cell(data.cells[r]?.[c] ?? null, data.hrefs.cells[r]![c]!)}
                </Fragment>
              ))}
              {hasTotal && cell(data.rowTotals[r] ?? null, data.hrefs.rowTotals[r]!, true)}
            </tr>
          ))}
          {folded.length > 0 && (
            <tr className="text-muted">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                {folded.length} more
              </th>
              {columns.map((c) => (
                <Fragment key={c}>
                  {cell(sum(folded.map((r) => data.cells[r]?.[c] ?? null)))}
                </Fragment>
              ))}
              {hasTotal && cell(sum(folded.map((r) => data.rowTotals[r] ?? null)), undefined, true)}
            </tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-rule-strong">
          <tr>
            <th scope="row" className="py-1.5 pr-2 text-left">
              Total
            </th>
            {columns.map((c) => (
              <Fragment key={c}>
                {cell(data.columnTotals[c] ?? null, data.hrefs.columnTotals[c]!, true)}
              </Fragment>
            ))}
            {hasTotal && cell(data.total, data.hrefs.total, true)}
          </tr>
        </tfoot>
      </table>
      <Link href={`/widgets/${widgetId}`} className="self-end text-xs text-ink-soft underline">
        Open the full table
      </Link>
    </div>
  );
}
