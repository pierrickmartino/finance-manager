import Link from 'next/link';
import { periodDates } from '@/lib/analytics/period';
import type { Formatter } from '@/lib/format';
import {
  PROFIT_AND_LOSS,
  type AnalyticsProfitAndLoss,
  type Pinnable,
  type ProfitAndLossRow,
  type ProfitAndLossRowId,
} from '@/server/services/analytics';
import { comparisonPeriod } from '@/server/services/analytics/comparison-period';
import { BASE_CURRENCY } from '@/server/services/fx/constants';
import { SectionCardPeriod } from './card-section';
import { ChangeLine } from './key-figure-change';
import { SectionCard, UnconvertedNote } from './section';

/** How a row reads: its rule (or fill) and its weight. */
interface RowLook {
  row: string;
  weight: string;
}

const LINE: RowLook = { row: 'border-t border-rule', weight: 'font-normal' };
/** A row closing a part of the statement: set off by a stronger rule and in bold. */
const SUBTOTAL: RowLook = { row: 'border-t border-rule-strong', weight: 'font-semibold' };
/** Net cash flow, the statement's foot: highlighted, and in bold. */
const FOOT: RowLook = { row: 'bg-accent-tint', weight: 'font-semibold' };

const LOOKS: Record<ProfitAndLossRowId, RowLook> = {
  income: LINE,
  expense: LINE,
  profit: SUBTOTAL,
  capital: LINE,
  unclassified: LINE,
  netCashFlow: FOOT,
};

interface StatementRowProps {
  row: ProfitAndLossRow;
  fmt: Formatter;
  /** Whether the statement has a Comparison period column: the data reaches back to it. */
  hasComparison: boolean;
}

/**
 * A row's change against the Comparison period: its % alone (the amount when there is no %),
 * without the dates the column header already names; a muted "—" for a row without one.
 */
function ComparisonCell({ row, fmt }: Omit<StatementRowProps, 'hasComparison'>) {
  if (row.earlier === null || row.change === null) {
    return <td className="rounded-r-md py-2 pr-2 pl-3 text-right align-top text-muted">—</td>;
  }
  return (
    <td className="rounded-r-md py-2 pr-2 pl-3 text-right align-top whitespace-nowrap tabular-nums">
      <ChangeLine change={row.change} fmt={fmt} isPercentOnly isLabelHidden />
    </td>
  );
}

/**
 * One row: its label (and what it leaves out), its amount opening what is behind it, then its
 * change against the Comparison period.
 */
function StatementRow({ row, fmt, hasComparison }: StatementRowProps) {
  const amount = fmt.amount(row.value, { currency: BASE_CURRENCY, isWhole: true });
  const { row: look, weight } = LOOKS[row.id];
  const amountCorner = hasComparison ? '' : 'rounded-r-md';
  return (
    <tr className={look}>
      <th scope="row" className={`rounded-l-md py-2 pr-3 pl-2 text-left align-top ${weight}`}>
        {row.label}
        {row.unconverted > 0 && (
          <div className="font-normal">
            <UnconvertedNote count={row.unconverted} />
          </div>
        )}
      </th>
      <td
        className={`${amountCorner} py-2 pr-2 pl-3 text-right align-top whitespace-nowrap tabular-nums ${weight}`}
      >
        <Link
          href={row.href}
          aria-label={`${row.label}: ${amount}`}
          className={`hover:underline ${row.value < 0 ? 'text-negative' : ''}`}
        >
          {amount}
        </Link>
      </td>
      {hasComparison && <ComparisonCell row={row} fmt={fmt} />}
    </tr>
  );
}

interface ProfitAndLossSectionProps {
  profitAndLoss: Promise<Pinnable<AnalyticsProfitAndLoss>>;
  fmt: Formatter;
}

/**
 * Analytics' Profit and loss, once it arrives (GLOSSARY: Profit and loss): the Period's statement,
 * a row per figure from Income down to Net cash flow, highlighted at its foot. Expense reads
 * positive; each amount opens the Transactions behind it. Beside it, when the Account data
 * reaches back that far, each row's % change against the Comparison period, which opens the
 * Transactions of both stretches. Its header holds its Card Period (GLOSSARY): pinned,
 * the statement reads over its own preset and compares with that preset's Comparison period.
 */
export async function ProfitAndLossSection({ profitAndLoss, fmt }: ProfitAndLossSectionProps) {
  const { rows, reading, isPinned } = await profitAndLoss;
  const hasComparison = rows.some((row) => row.change !== null);
  const dates = { from: reading.from, to: reading.to };
  const periodWords = periodDates(dates);
  return (
    <SectionCard
      name={PROFIT_AND_LOSS}
      titleAside={
        <SectionCardPeriod
          name={PROFIT_AND_LOSS}
          section="profit-and-loss"
          reading={reading}
          isPinned={isPinned}
        />
      }
    >
      <table className="w-full max-w-2xl border-collapse text-sm">
        <caption className="sr-only">
          {PROFIT_AND_LOSS}, {periodWords}
        </caption>
        {hasComparison && (
          <thead>
            <tr className="text-muted">
              <td />
              <th scope="col" className="pr-2 pb-1 pl-3 text-right font-normal">
                {periodWords}
              </th>
              <th scope="col" className="pr-2 pb-1 pl-3 text-right font-normal">
                <span className="sr-only">Compared with </span>
                {periodDates(comparisonPeriod(reading.period, dates))}
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => (
            <StatementRow key={row.id} row={row} fmt={fmt} hasComparison={hasComparison} />
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}
