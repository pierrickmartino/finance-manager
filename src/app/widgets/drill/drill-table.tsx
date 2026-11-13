import Link from 'next/link';
import type { ReactNode } from 'react';
import { splitLabel } from '@/app/transactions/transaction-display';
import { categoryLabel } from '@/lib/classification';
import type { Formatter } from '@/lib/format';
import type { BackLink } from '@/lib/reporting/drill-origin';
import type { TransactionListItem } from '@/server/services/transactions';

const CELL = 'px-3 py-2 text-left align-top';
const AMOUNT_CELL = `${CELL} text-right whitespace-nowrap tabular-nums`;

/** A last column that only some Drill-downs show, such as the Widget's "Counted (CHF)". */
export interface DrillTableColumn<T> {
  heading: string;
  cell: (transaction: T) => ReactNode;
}

interface DrillTableProps<T extends TransactionListItem> {
  transactions: readonly T[];
  fmt: Formatter;
  extraColumn?: DrillTableColumn<T>;
}

/**
 * The Transactions of a Drill-down (GLOSSARY), each linking to its own page; a split one shows
 * its whole native Amount and "Split (n)" for its Category.
 */
export function DrillTable<T extends TransactionListItem>({
  transactions,
  fmt,
  extraColumn,
}: DrillTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Drill-down Transactions" className="w-full text-sm">
        <thead className="border-b border-rule">
          <tr>
            <th className={CELL}>Date</th>
            <th className={CELL}>Account</th>
            <th className={CELL}>Description</th>
            <th className={CELL}>Payee</th>
            <th className={CELL}>Category</th>
            <th className={`${CELL} text-right`}>Amount</th>
            {extraColumn && <th className={`${CELL} text-right`}>{extraColumn.heading}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td className={`${CELL} whitespace-nowrap tabular-nums`}>
                {fmt.date(transaction.bookingDate)}
              </td>
              <td className={CELL}>{transaction.accountName}</td>
              <td className={CELL}>
                <Link href={`/transactions/${transaction.id}`} className="hover:underline">
                  {transaction.rawDescription || '(no description)'}
                </Link>
              </td>
              <td className={CELL}>{transaction.payee?.name ?? '—'}</td>
              <td className={CELL}>
                {transaction.category
                  ? categoryLabel(transaction.category)
                  : (splitLabel(transaction) ?? 'Unclassified')}
              </td>
              <td className={AMOUNT_CELL}>
                {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
              </td>
              {extraColumn && <td className={AMOUNT_CELL}>{extraColumn.cell(transaction)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The way back to where a Drill-down was opened. */
export function BackTo({ href, label }: BackLink) {
  return (
    <Link href={href} className="text-sm underline">
      {label}
    </Link>
  );
}
