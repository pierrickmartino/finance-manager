'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { BulkActionBar, type BulkTag } from '@/components/bulk-edit/bulk-action-bar';
import { HeaderCheckbox, tagsOf, useRowSelection } from '@/components/bulk-edit/row-selection';
import { useFormatter } from '@/components/formatter-provider';
import { CARD_CLASS } from '@/components/surface';
import type { CategoryGroup } from '@/server/services/categories';
import type { BulkFilter } from '@/server/services/transactions/bulk-edit';
import type { TransactionListItem } from '@/server/services/transactions';
import { transactionsHref, type SearchValues } from './search';
import { amountClass, CategoryLabel, transactionName } from './transaction-display';
import { TransactionMorph } from './transaction-morph';

const CELL = 'px-3 py-2 align-top';
/** The checkbox column: room enough to hit the box, nothing more. */
const CHECK_CELL = 'w-0 py-2 pr-1 pl-3 align-top';

interface TransactionListProps {
  transactions: TransactionListItem[];
  values: SearchValues;
  page: number;
  /** How many Transactions the filter matches, on every page. */
  total: number;
  /** The list's filter: the scope of "Select all N matching this filter". */
  filter: BulkFilter;
  /** The row the preview pane shows (`xl` and up). */
  selectedId: string | null;
  /** What the Bulk edit bar offers. */
  lists: { groups: CategoryGroup[]; payeeNames: string[]; tags: BulkTag[] };
  /** Shown under the table (the pagination). */
  children?: ReactNode;
}

/**
 * The page of Transactions. From `xl` up a row's link previews it in the pane beside the
 * list; below, there is no pane, so the link opens the Transaction itself.
 *
 * Rows can be ticked for a Bulk edit: one by one, a range with shift-click from the last
 * ticked row, or the whole page from the header. The selection lives here only, never in the
 * URL: the page mounts the list afresh (by key) on every page or filter change, which clears it.
 * Once the whole page is ticked, "Select all N matching this filter" widens the selection to
 * the filter itself, every page of it; any other change to the selection narrows it back.
 */
export function TransactionList({
  transactions,
  values,
  page,
  total,
  filter,
  selectedId,
  lists,
  children,
}: TransactionListProps) {
  const selection = useRowSelection(transactions.map((transaction) => transaction.id));
  const { ticked } = selection;
  const [isAllMatching, setIsAllMatching] = useState(false);
  // Only listed rows count: an edit can move a ticked row out of the filter.
  const selected = transactions.filter((transaction) => ticked.has(transaction.id));
  const isPageTicked = transactions.length > 0 && selected.length === transactions.length;
  const isAll = isAllMatching && isPageTicked;

  // Any change to the ticks narrows the selection back to the ticked rows.
  const tick = (id: string, isChecked: boolean, isRange: boolean): void => {
    setIsAllMatching(false);
    selection.tick(id, isChecked, isRange);
  };
  const tickPage = (isChecked: boolean): void => {
    setIsAllMatching(false);
    selection.tickAll(isChecked);
  };

  const clear = (): void => tickPage(false);

  return (
    <div className="flex flex-col gap-3">
      <BulkActionBar
        scope={
          isAll ? { filter } : { transactionIds: selected.map((transaction) => transaction.id) }
        }
        count={isAll ? total : selected.length}
        groups={lists.groups}
        payeeNames={lists.payeeNames}
        tags={lists.tags}
        // Beyond this page the selection's Tags aren't known: every Tag is offered.
        removableTags={isAll ? lists.tags : tagsOf(selected)}
        onClear={clear}
      />
      {isPageTicked && total > transactions.length && (
        <SelectAllMatching
          pageCount={transactions.length}
          total={total}
          isAll={isAll}
          onChange={setIsAllMatching}
        />
      )}
      <div className={`${CARD_CLASS} overflow-x-auto`}>
        <table aria-label="Transactions" className="w-full text-sm">
          <thead className="border-b border-rule text-xs text-muted">
            <tr>
              <th className={CHECK_CELL}>
                <HeaderCheckbox
                  selectedCount={selected.length}
                  rowCount={transactions.length}
                  onChange={tickPage}
                  label="Select every Transaction on this page"
                />
              </th>
              <th className={`${CELL} text-left font-medium`}>Date</th>
              <th className={`${CELL} text-left font-medium`}>Transaction</th>
              <th className={`${CELL} text-right font-medium`}>Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {transactions.map((transaction) => (
              <Row
                key={transaction.id}
                transaction={transaction}
                previewHref={transactionsHref(values, page, transaction.id)}
                isPreviewed={transaction.id === selectedId}
                isTicked={ticked.has(transaction.id)}
                onTick={(isChecked, isRange) => tick(transaction.id, isChecked, isRange)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  );
}

interface SelectAllMatchingProps {
  /** Rows on this page. */
  pageCount: number;
  /** Transactions the filter matches. */
  total: number;
  /** Whether the selection is the whole filter rather than this page. */
  isAll: boolean;
  onChange: (isAll: boolean) => void;
}

/** With the whole page ticked: widens the selection to every match of the filter, or back. */
function SelectAllMatching({ pageCount, total, isAll, onChange }: SelectAllMatchingProps) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-soft">
      {isAll
        ? `All ${total} Transactions matching this filter are selected.`
        : `All ${pageCount} Transactions on this page are selected.`}
      <button
        type="button"
        onClick={() => onChange(!isAll)}
        className="font-medium text-ink underline hover:no-underline"
      >
        {isAll ? 'Select only this page' : `Select all ${total} matching this filter`}
      </button>
    </p>
  );
}

interface RowProps {
  transaction: TransactionListItem;
  previewHref: string;
  isPreviewed: boolean;
  isTicked: boolean;
  /** `isRange`: shift was held, so the rows from the last ticked one follow. */
  onTick: (isChecked: boolean, isRange: boolean) => void;
}

function Row({ transaction, previewHref, isPreviewed, isTicked, onTick }: RowProps) {
  const fmt = useFormatter();
  const name = transactionName(transaction);
  const rowClass = isTicked ? 'bg-accent-tint' : isPreviewed ? 'xl:bg-sunken' : 'hover:bg-paper';
  return (
    <TransactionMorph transactionId={transaction.id} part="row">
      <tr className={rowClass}>
        <td className={CHECK_CELL}>
          <input
            type="checkbox"
            checked={isTicked}
            // React's change event for a checkbox is its click, which knows about shift.
            onChange={(event) =>
              onTick(event.target.checked, (event.nativeEvent as MouseEvent).shiftKey)
            }
            aria-label={`Select ${name} on ${fmt.date(transaction.bookingDate)}`}
            className="mt-0.5 accent-accent-ink"
          />
        </td>
        <td className={`${CELL} whitespace-nowrap text-muted tabular-nums`}>
          {fmt.date(transaction.bookingDate)}
        </td>
        <td className={`${CELL} max-w-0 w-full`}>
          <Link
            href={previewHref}
            scroll={false}
            aria-current={isPreviewed ? 'true' : undefined}
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
          <div className="truncate text-xs text-muted">
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
            <div className="text-xs font-normal text-muted">
              of which{' '}
              {fmt.amount(transaction.matchingSplitAmountMinor, { currency: transaction.currency })}{' '}
              matches the filter
            </div>
          )}
        </td>
      </tr>
    </TransactionMorph>
  );
}
