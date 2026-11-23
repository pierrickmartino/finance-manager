import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import {
  PROFIT_AND_LOSS,
  type AnalyticsProfitAndLoss,
  type ProfitAndLossRow,
  type ProfitAndLossRowId,
} from '@/server/services/analytics';
import { BASE_CURRENCY } from '@/server/services/fx/constants';
import { ChangeLine } from './key-figure-change';
import { SectionCard, UnconvertedNote } from './section';

/** The rows that close a part of the statement: set off by a stronger rule and in bold. */
const SUBTOTALS: ReadonlySet<ProfitAndLossRowId> = new Set(['profit', 'netCashFlow']);

/** A row's look: the quiet rows, the subtotals, and Net cash flow highlighted at the foot. */
function rowClass(id: ProfitAndLossRowId): string {
  if (id === 'netCashFlow') return 'bg-accent-tint';
  return SUBTOTALS.has(id) ? 'border-t border-rule-strong' : 'border-t border-rule';
}

const weightOf = (id: ProfitAndLossRowId) => (SUBTOTALS.has(id) ? 'font-semibold' : 'font-normal');

interface StatementRowProps {
  row: ProfitAndLossRow;
  fmt: Formatter;
  /** Whether the statement has a Comparison span column: the data reaches back to it. */
  hasComparison: boolean;
}

/** A row's amount over the Comparison span, then its change line, which wraps on a phone. */
function ComparisonCell({ row, fmt }: Omit<StatementRowProps, 'hasComparison'>) {
  if (row.earlier === null || row.change === null) return <td className="rounded-r-md" />;
  const earlier = fmt.amount(row.earlier, { currency: BASE_CURRENCY, isWhole: true });
  return (
    <td className="rounded-r-md py-2 pr-2 pl-3 text-right align-top tabular-nums">
      <div className={`whitespace-nowrap ${row.earlier < 0 ? 'text-negative' : ''}`}>{earlier}</div>
      <ChangeLine change={row.change} fmt={fmt} />
    </td>
  );
}

/**
 * One row: its label (and what it leaves out), its amount opening what is behind it, then its
 * amount over the Comparison span and its change.
 */
function StatementRow({ row, fmt, hasComparison }: StatementRowProps) {
  const amount = fmt.amount(row.value, { currency: BASE_CURRENCY, isWhole: true });
  const weight = weightOf(row.id);
  const amountCorner = hasComparison ? '' : 'rounded-r-md';
  return (
    <tr className={rowClass(row.id)}>
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
  profitAndLoss: Promise<AnalyticsProfitAndLoss>;
  fmt: Formatter;
}

/**
 * Analytics' Profit and loss, once it arrives (GLOSSARY: Profit and loss): the Span's statement,
 * a row per figure from Income down to Net cash flow, highlighted at its foot. Expense reads
 * positive; each amount opens the Transactions behind it. Beside it, when the Account data
 * reaches back that far, each row's amount over the Comparison span and its change line, which
 * opens the Transactions of both stretches.
 */
export async function ProfitAndLossSection({ profitAndLoss, fmt }: ProfitAndLossSectionProps) {
  const { rows } = await profitAndLoss;
  const hasComparison = rows.some((row) => row.change !== null);
  return (
    <SectionCard name={PROFIT_AND_LOSS}>
      <table className="w-full max-w-2xl border-collapse text-sm">
        <caption className="sr-only">{PROFIT_AND_LOSS} over the Span</caption>
        {hasComparison && (
          <thead>
            <tr className="text-muted">
              <td />
              <th scope="col" className="pr-2 pb-1 pl-3 text-right font-normal">
                Span
              </th>
              <th scope="col" className="pr-2 pb-1 pl-3 text-right font-normal">
                Comparison span
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
