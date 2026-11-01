import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { TransactionListItem } from '@/server/services/transactions';
import { transactionsHref, type SearchValues } from './search';
import { amountClass, CategoryLabel, transactionName } from './transaction-display';

const CELL = 'px-3 py-2 align-top';

interface TransactionListProps {
  fmt: Formatter;
  transactions: TransactionListItem[];
  values: SearchValues;
  page: number;
  /** The row the preview pane shows (`xl` and up). */
  selectedId: string | null;
}

/**
 * The page of Transactions. From `xl` up a row's link previews it in the pane beside the
 * list; below, there is no pane, so the link opens the Transaction itself.
 */
export function TransactionList({
  fmt,
  transactions,
  values,
  page,
  selectedId,
}: TransactionListProps) {
  return (
    <div className={`${CARD_CLASS} overflow-x-auto`}>
      <table aria-label="Transactions" className="w-full text-sm">
        <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className={`${CELL} text-left font-medium`}>Date</th>
            <th className={`${CELL} text-left font-medium`}>Transaction</th>
            <th className={`${CELL} text-right font-medium`}>Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {transactions.map((transaction) => (
            <Row
              key={transaction.id}
              fmt={fmt}
              transaction={transaction}
              previewHref={transactionsHref(values, page, transaction.id)}
              isSelected={transaction.id === selectedId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  fmt: Formatter;
  transaction: TransactionListItem;
  previewHref: string;
  isSelected: boolean;
}

function Row({ fmt, transaction, previewHref, isSelected }: RowProps) {
  const name = transactionName(transaction);
  return (
    <tr
      className={
        isSelected
          ? 'xl:bg-zinc-100 xl:dark:bg-zinc-800'
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
      }
    >
      <td className={`${CELL} whitespace-nowrap text-zinc-500 tabular-nums`}>
        {fmt.date(transaction.bookingDate)}
      </td>
      <td className={`${CELL} max-w-0 w-full`}>
        <Link
          href={previewHref}
          scroll={false}
          aria-current={isSelected ? 'true' : undefined}
          className="hidden truncate font-medium hover:underline xl:block"
        >
          {name}
        </Link>
        <Link
          href={`/transactions/${transaction.id}`}
          className="block truncate font-medium hover:underline xl:hidden"
        >
          {name}
        </Link>
        <div className="truncate text-xs text-zinc-500">
          <CategoryLabel transaction={transaction} />
          {' · '}
          {transaction.accountName}
          {transaction.isManual && ' · Manual'}
          {transaction.tags.map((tag) => (
            <span key={tag.id} className="ml-1.5">
              #{tag.name}
            </span>
          ))}
        </div>
      </td>
      <td
        className={`${CELL} text-right font-medium whitespace-nowrap tabular-nums ${amountClass(transaction.amountMinor)}`}
      >
        {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
        {transaction.matchingSplitAmountMinor !== null && (
          <div className="text-xs font-normal text-zinc-500">
            of which{' '}
            {fmt.amount(transaction.matchingSplitAmountMinor, { currency: transaction.currency })}{' '}
            in this Category
          </div>
        )}
      </td>
    </tr>
  );
}
