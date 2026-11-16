'use client';

import Link from 'next/link';
import { BulkActionBar, type BulkEditLists } from '@/components/bulk-edit/bulk-action-bar';
import type { BulkScope } from '@/components/bulk-edit/scope';
import {
  CHECK_CELL_CLASS,
  HeaderCheckbox,
  RowCheckboxCell,
  tagsOf,
  useRowSelection,
} from '@/components/bulk-edit/row-selection';
import { useFormatter } from '@/components/formatter-provider';
import { SECONDARY_BUTTON_CLASS } from '@/components/surface';
import type { TransactionListItem } from '@/server/services/transactions';
import { unclassifiedHref } from './view';

const CELL = 'px-3 py-2 text-left align-top';

interface GroupTransactionsProps {
  groupKey: string;
  /** The group's heading: not repeated per row. */
  description: string;
  /** Members of the group shown (the whole group, up to one page); none once it is emptied. */
  transactions: TransactionListItem[];
  /** Every member of the group still Unclassified, including those not shown. */
  groupCount: number;
  /** What the Bulk edit bar offers. */
  lists: BulkEditLists;
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
  const {
    ticked,
    tick,
    tickAll,
    isWholeScope: isWholeGroup,
    setWholeScope,
  } = useRowSelection(transactions.map((t) => t.id));
  // Only listed rows count: classified ones leave the group.
  const selected = transactions.filter((transaction) => ticked.has(transaction.id));

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
        onClear={() => tickAll(false)}
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
              onClick={() => setWholeScope(true)}
              className={`${SECONDARY_BUTTON_CLASS} ${isWholeGroup ? 'bg-accent-tint' : ''}`}
            >
              Select all {groupCount}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table aria-label={`Transactions in ${description}`} className="w-full text-sm">
              <thead className="border-b border-rule">
                <tr>
                  <th className={CHECK_CELL_CLASS}>
                    <HeaderCheckbox
                      selectedCount={selected.length}
                      rowCount={transactions.length}
                      onChange={tickAll}
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
                      <RowCheckboxCell
                        isTicked={ticked.has(transaction.id)}
                        onTick={(isChecked, isRange) => tick(transaction.id, isChecked, isRange)}
                        label={`Select ${name} on ${date}`}
                      />
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
