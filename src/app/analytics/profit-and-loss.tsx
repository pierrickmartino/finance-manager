import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import {
  PROFIT_AND_LOSS,
  type AnalyticsProfitAndLoss,
  type ProfitAndLossRow,
  type ProfitAndLossRowId,
} from '@/server/services/analytics';
import { BASE_CURRENCY } from '@/server/services/fx/constants';
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
}

/** One row: its label (and what it leaves out), then its amount opening what is behind it. */
function StatementRow({ row, fmt }: StatementRowProps) {
  const amount = fmt.amount(row.value, { currency: BASE_CURRENCY, isWhole: true });
  const weight = weightOf(row.id);
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
        className={`rounded-r-md py-2 pr-2 pl-3 text-right align-top whitespace-nowrap tabular-nums ${weight}`}
      >
        <Link
          href={row.href}
          aria-label={`${row.label}: ${amount}`}
          className={`hover:underline ${row.value < 0 ? 'text-negative' : ''}`}
        >
          {amount}
        </Link>
      </td>
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
 * positive; each amount opens the Transactions behind it.
 */
export async function ProfitAndLossSection({ profitAndLoss, fmt }: ProfitAndLossSectionProps) {
  const { rows } = await profitAndLoss;
  return (
    <SectionCard name={PROFIT_AND_LOSS}>
      <table className="w-full max-w-xl border-collapse text-sm">
        <caption className="sr-only">{PROFIT_AND_LOSS} over the Span</caption>
        <tbody>
          {rows.map((row) => (
            <StatementRow key={row.id} row={row} fmt={fmt} />
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}
