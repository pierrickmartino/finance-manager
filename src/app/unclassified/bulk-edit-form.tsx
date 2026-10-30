'use client';

import Link from 'next/link';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import type { ActionResult } from '@/server/actions';
import type { CategoryGroup } from '@/server/services/categories';
import type { TransactionListItem } from '@/server/services/transactions';
import type { BulkEditResult } from '@/server/services/transactions/bulk-edit';

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const CELL = 'px-3 py-2 text-left align-top';
const PRIMARY =
  'rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300';
const SECONDARY =
  'rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800';

interface BulkEditFormProps {
  /** Shown in the form's accessible name. */
  description: string;
  /** Members of the group shown on this page (the whole group, up to one page). */
  transactions: TransactionListItem[];
  /** Every member of the group, including those beyond this page. */
  groupCount: number;
  groups: CategoryGroup[];
  payeeNames: string[];
  action: (
    previous: ActionResult<BulkEditResult> | null,
    formData: FormData,
  ) => Promise<ActionResult<BulkEditResult>>;
}

/**
 * Sets the Payee, Category or Tags of a whole Unclassified group, or of the ticked Transactions
 * (spec 62). Blank fields are left alone; filled ones are locked against the Rules (spec 64).
 */
export function BulkEditForm({
  description,
  transactions,
  groupCount,
  groups,
  payeeNames,
  action,
}: BulkEditFormProps) {
  const fmt = useFormatter();
  const [state, formAction, isPending] = useActionState(action, null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Ticked Transactions that are still listed (classified ones leave the group).
  const selectedCount = transactions.filter((transaction) => selected.has(transaction.id)).length;

  const toggle = (id: string, isChecked: boolean): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (isChecked) next.add(id);
      else next.delete(id);
      return next;
    });

  // Submitted by hand so a rejected form keeps what was typed (React resets action forms),
  // passing the clicked button so the action knows the scope.
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  };

  return (
    <form
      aria-label={`Classify ${description}`}
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Payee
          <input
            name="payee"
            list="bulk-payee-names"
            maxLength={100}
            autoComplete="off"
            className={INPUT}
          />
          <datalist id="bulk-payee-names">
            {payeeNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Category
          <select name="categoryId" defaultValue="" className={INPUT}>
            <option value="">Leave as is</option>
            {groups.map((group) => (
              <optgroup key={group.id} label={group.name}>
                {group.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tags
          <input
            name="tags"
            autoComplete="off"
            placeholder="Vacation 2024, Family"
            className={INPUT}
          />
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        Blank fields are left as they are. The fields you fill in are locked against Rules.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" name="scope" value="group" disabled={isPending} className={PRIMARY}>
          Classify all {groupCount}
        </button>
        <button
          type="submit"
          name="scope"
          value="selected"
          disabled={isPending || selectedCount === 0}
          className={SECONDARY}
        >
          Classify selected ({selectedCount})
        </button>
        {state?.ok && (
          <span role="status" className="text-sm text-zinc-500">
            Classified {state.data.count} Transaction{state.data.count === 1 ? '' : 's'}.
          </span>
        )}
      </div>
      {state && !state.ok && <FieldError message={state.error} />}

      <div className="overflow-x-auto">
        <table aria-label={`Transactions in ${description}`} className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className={CELL}>
                <span className="sr-only">Select</span>
              </th>
              <th className={CELL}>Date</th>
              <th className={CELL}>Account</th>
              <th className={CELL}>Description</th>
              <th className={CELL}>Payee</th>
              <th className={`${CELL} text-right`}>Amount</th>
              <th className={CELL}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td className={CELL}>
                  <input
                    type="checkbox"
                    name="transactionId"
                    value={transaction.id}
                    checked={selected.has(transaction.id)}
                    onChange={(event) => toggle(transaction.id, event.target.checked)}
                    aria-label={`Select ${transaction.rawDescription || 'Transaction'} on ${fmt.date(transaction.bookingDate)}`}
                  />
                </td>
                <td className={`${CELL} whitespace-nowrap tabular-nums`}>
                  {fmt.date(transaction.bookingDate)}
                </td>
                <td className={CELL}>{transaction.accountName}</td>
                <td className={CELL}>
                  {transaction.rawDescription || '(no description)'}
                  {transaction.counterpartyName && (
                    <div className="text-xs text-zinc-500">{transaction.counterpartyName}</div>
                  )}
                </td>
                <td className={CELL}>{transaction.payee?.name ?? '—'}</td>
                <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                  {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
                </td>
                <td className={`${CELL} whitespace-nowrap`}>
                  {/* Per-Transaction actions. #18 adds "Create rule from this Transaction" here. */}
                  <Link href={`/transactions/${transaction.id}`} className="hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
