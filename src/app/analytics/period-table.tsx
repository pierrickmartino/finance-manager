import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { PeriodView } from '@/lib/analytics/period-view';
import type { AnalyticsPeriod, Figure, FigureRow, PeriodTable } from '@/server/services/analytics';
import { drillHref } from './links';

/*
 * A table of Analytics: one row per figure row, one column per period of the Period window
 * (oldest left, the current one "to date" on the right, on a sunken fill behind a dashed rule),
 * then Total and Average. Every figure opens its Drill-down. Wide tables scroll sideways inside
 * their card, with the row names kept in view.
 */

const HEAD = 'px-3 py-2 font-medium whitespace-nowrap';
const CELL = 'px-3 py-1.5 text-right tabular-nums whitespace-nowrap';
const TO_DATE = 'border-l border-dashed border-rule-strong bg-sunken';
const SUMMARY = 'border-l border-rule';

interface PeriodTableViewProps {
  /** The table's accessible name. */
  label: string;
  table: PeriodTable;
  view: PeriodView;
  fmt: Formatter;
  /** The keys of rows that add up others (Net, a subtotal): set apart in bold. */
  emphasised?: readonly string[];
}

export function PeriodTableView({
  label,
  table,
  view,
  fmt,
  emphasised = [],
}: PeriodTableViewProps) {
  return (
    <div className="overflow-x-auto" data-testid="period-table-scroll">
      <table aria-label={label} className="w-full text-sm">
        <thead className="border-b border-rule">
          <tr>
            <th scope="col" className={`${HEAD} sticky left-0 bg-surface text-left`}>
              <span className="sr-only">Row</span>
            </th>
            {table.periods.map((period) => (
              <PeriodHeader key={period.key} period={period} />
            ))}
            <th scope="col" className={`${HEAD} ${SUMMARY} text-right`}>
              Total
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Average
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {table.rows.map((row) => (
            <Row
              key={row.key}
              row={row}
              periods={table.periods}
              view={view}
              fmt={fmt}
              isEmphasised={emphasised.includes(row.key)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodHeader({ period }: { period: AnalyticsPeriod }) {
  return (
    <th scope="col" className={`${HEAD} text-right ${period.isToDate ? TO_DATE : ''}`}>
      {period.label}
      {period.isToDate && <span className="block text-xs font-normal text-muted">to date</span>}
    </th>
  );
}

interface RowProps {
  row: FigureRow;
  periods: AnalyticsPeriod[];
  view: PeriodView;
  fmt: Formatter;
  isEmphasised: boolean;
}

function Row({ row, periods, view, fmt, isEmphasised }: RowProps) {
  const shared = { view, fmt };
  return (
    <tr className={isEmphasised ? 'font-semibold' : ''}>
      <th scope="row" className={`${HEAD} sticky left-0 bg-surface text-left`}>
        {row.label}
      </th>
      {row.cells.map((figure, index) => {
        const period = periods[index]!;
        return (
          <FigureCell
            key={period.key}
            {...shared}
            figure={figure}
            label={`${row.label}, ${period.label}${period.isToDate ? ' to date' : ''}`}
            className={period.isToDate ? TO_DATE : ''}
          />
        );
      })}
      <FigureCell
        {...shared}
        figure={row.total}
        label={`${row.label}, Total`}
        className={SUMMARY}
      />
      <FigureCell {...shared} figure={row.average} label={`${row.label}, Average`} className="" />
    </tr>
  );
}

interface FigureCellProps {
  figure: Figure;
  /** What the figure is, for its link's accessible name ("Income, Mar 2025"). */
  label: string;
  view: PeriodView;
  fmt: Formatter;
  className: string;
}

function FigureCell({ figure, label, view, fmt, className }: FigureCellProps) {
  if (figure.value === null) {
    return (
      <td className={`${CELL} ${className}`}>
        <span className="text-faint" aria-label={`${label}: none`}>
          —
        </span>
      </td>
    );
  }
  const amount = fmt.amount(figure.value, { currency: 'CHF' });
  return (
    <td className={`${CELL} ${className}`}>
      <Link
        href={drillHref(view, figure.drill)}
        aria-label={`${label}: ${amount}`}
        className={`hover:underline ${figure.value < 0 ? 'text-negative' : ''}`}
      >
        {amount}
      </Link>
    </td>
  );
}
