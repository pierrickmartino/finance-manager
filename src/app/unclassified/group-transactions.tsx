'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BulkActionBar, type BulkTag } from '@/components/bulk-edit/bulk-action-bar';
import type { BulkScope } from '@/components/bulk-edit/actions';
import { HeaderCheckbox, tagsOf, useRowSelection } from '@/components/bulk-edit/row-selection';
import { useFormatter } from '@/components/formatter-provider';
import { SECONDARY_BUTTON_CLASS } from '@/components/surface';
import type { CategoryGroup } from '@/server/services/categories';
import type { TransactionListItem } from '@/server/services/transactions';
import { unclassifiedHref } from './view';

const CELL = 'px-3 py-2 text-left align-top';
/** The checkbox column: room enough to hit the box, nothing more. */
const CHECK_CELL = 'w-0 py-2 pr-1 pl-3 align-top';

interface GroupTransactionsProps {
  groupKey: string;
  /** The group's heading: not repeated per row. */
  description: string;
  /** Members of the group shown (the whole group, up to one page); none once it is emptied. */
  transactions: TransactionListItem[];
  /** Every member of the group still Unclassified, including those not shown. */
  groupCount: number;
  /** What the Bulk edit bar offers. */
  lists: { groups: CategoryGroup[]; payeeNames: string[]; tags: BulkTag[] };
}

/**
 * The group's Transactions, ticked for a Bulk edit through the shared action bar like the
 * Transactions list: one by one, a shift-click range, every row shown from the header, or
 * "Select all N", which scopes the edit to the whole group (its members still Unclassified
 * when it applies, shown or not). Stays mounted once the group is emptied, so the bar can
 * report the last edit.
 */
export function GroupTransactions({
  groupKey,
  description,
  transactions,
  groupCount,
  lists,
}: GroupTransactionsProps) {
  const fmt = useFormatter();
  const { ticked, tick, tickAll } = useRowSelection(transactions.map((t) => t.id));
  const [isWholeGroup, setIsWholeGroup] = useState(false);
  // Only listed rows count: classified ones leave the group.
  const selected = transactions.filter((transaction) => ticked.has(transaction.id));

  // Any change to the ticks narrows the scope back to the ticked rows.
  const tickRow = (id: string, isChecked: boolean, isRange: boolean): void => {
    setIsWholeGroup(false);
    tick(id, isChecked, isRange);
  };
  const tickShown = (isChecked: boolean): void => {
    setIsWholeGroup(false);
    tickAll(isChecked);
  };
  const selectGroup = (): void => {
    tickAll(true);
    setIsWholeGroup(true);
  };

  const scope: BulkScope = isWholeGroup
    ? { groupKey }
    : { transactionIds: selected.map((transaction) => transaction.id) };

  return (
    <div className="flex flex-col gap-3">
      <BulkActionBar
        scope={scope}
        count={isWholeGroup ? groupCount : selected.length}
        groups={lists.groups}
        payeeNames={lists.payeeNames}
        tags={lists.tags}
        // Beyond the rows shown the selection's Tags aren't known: every Tag is offered.
        removableTags={
          isWholeGroup && groupCount > transactions.length
            ? lists.tags
            : tagsOf(isWholeGroup ? transactions : selected)
        }
        onClear={() => tickShown(false)}
      />
      {transactions.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">This group has no Unclassified Transactions left.</p>
          <Link href={unclassifiedHref({})} className="text-sm font-medium hover:underline">
            Next group →
          </Link>
        </div>
      ) : (
        <>
          <div>
            <button
              type="button"
              aria-pressed={isWholeGroup}
              onClick={selectGroup}
              className={`${SECONDARY_BUTTON_CLASS} ${isWholeGroup ? 'bg-accent-tint' : ''}`}
            >
              Select all {groupCount}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table aria-label={`Transactions in ${description}`} className="w-full text-sm">
              <thead className="border-b border-rule">
                <tr>
                  <th className={CHECK_CELL}>
                    <HeaderCheckbox
                      selectedCount={selected.length}
                      rowCount={transactions.length}
                      onChange={tickShown}
                      label="Select every Transaction shown"
                    />
                  </th>
                  <th className={CELL}>Date</th>
                  <th className={CELL}>Account</th>
                  <th className={CELL}>Payee</th>
                  <th className={`${CELL} text-right`}>Amount</th>
                  <th className={CELL}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {transactions.map((transaction) => {
                  const name = transaction.rawDescription || 'Transaction';
                  const date = fmt.date(transaction.bookingDate);
                  return (
                    <tr
                      key={transaction.id}
                      className={ticked.has(transaction.id) ? 'bg-accent-tint' : undefined}
                    >
                      <td className={CHECK_CELL}>
                        <input
                          type="checkbox"
                          checked={ticked.has(transaction.id)}
                          // React's change event for a checkbox is its click, which knows shift.
                          onChange={(event) =>
                            tickRow(
                              transaction.id,
                              event.target.checked,
                              (event.nativeEvent as MouseEvent).shiftKey,
                            )
                          }
                          aria-label={`Select ${name} on ${date}`}
                          className="mt-0.5 accent-accent-ink"
                        />
                      </td>
                      <td className={`${CELL} whitespace-nowrap tabular-nums`}>{date}</td>
                      <td className={CELL}>
                        {transaction.accountName}
                        {/* The heading names the group; only other spellings are worth repeating. */}
                        {transaction.rawDescription !== description && (
                          <div className="text-xs text-muted">
                            {transaction.rawDescription || '(no description)'}
                          </div>
                        )}
                      </td>
                      <td className={CELL}>{transaction.payee?.name ?? '—'}</td>
                      <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                        {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
                      </td>
                      <td className={`${CELL} whitespace-nowrap`}>
                        <Link href={`/transactions/${transaction.id}`} className="hover:underline">
                          Open
                        </Link>{' '}
                        ·{' '}
                        <Link
                          href={`/rules/new?fromTransaction=${transaction.id}`}
                          aria-label={`Create rule from ${name} on ${date}`}
                          className="hover:underline"
                        >
                          Create rule
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
