'use client';

import { startTransition, useActionState, useRef, type FormEvent } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { FieldError, SubmitButton, TextField } from '@/components/form';
import type { ActionResult } from '@/server/actions';
import type { Transaction } from '@/server/services/transactions/model';

type TransactionAction = (
  previous: ActionResult<Transaction> | null,
  formData: FormData,
) => Promise<ActionResult<Transaction>>;

interface ManualTransactionFormProps {
  action: TransactionAction;
  currency: string;
  submitLabel: string;
  /** Prefills the form for editing. Without it, the form is a quick-entry form. */
  transaction?: Transaction;
  /** Quick entry: the date the first row starts with. */
  defaultDate?: string;
}

/**
 * Enter submits. In quick entry, a saved row clears the amount, description and counterparty,
 * keeps the date for the next row, and puts the cursor back in Amount.
 */
export function ManualTransactionForm({
  action,
  currency,
  submitLabel,
  transaction,
  defaultDate,
}: ManualTransactionFormProps) {
  const fmt = useFormatter();
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const isQuickEntry = !transaction;

  const [state, formAction, isPending] = useActionState(
    async (previous: ActionResult<Transaction> | null, formData: FormData) => {
      const result = await action(previous, formData);
      const form = formRef.current;
      if (result.ok && isQuickEntry && form) {
        for (const name of ['amount', 'description', 'counterpartyName']) {
          const field = form.elements.namedItem(name);
          if (field instanceof HTMLInputElement) field.value = '';
        }
        amountRef.current?.focus();
      }
      return result;
    },
    null,
  );

  // Submit without React's automatic form reset: the date carries over, and a rejected row
  // keeps what was typed.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_9rem_1fr_1fr_auto] sm:items-end">
        <TextField
          label="Date"
          name="bookingDate"
          type="date"
          required
          defaultValue={transaction?.bookingDate ?? defaultDate}
        />
        <TextField
          ref={amountRef}
          label={`Amount (${currency})`}
          name="amount"
          inputMode="decimal"
          required
          autoComplete="off"
          placeholder={fmt.amount(-123450)}
          defaultValue={transaction ? fmt.amount(transaction.amountMinor) : ''}
        />
        <TextField
          label="Description"
          name="description"
          required
          maxLength={500}
          autoComplete="off"
          defaultValue={transaction?.rawDescription}
        />
        <TextField
          label="Counterparty"
          name="counterpartyName"
          maxLength={500}
          autoComplete="off"
          defaultValue={transaction?.counterpartyName ?? ''}
        />
        <div>
          <SubmitButton isPending={isPending}>{submitLabel}</SubmitButton>
        </div>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
      {state?.ok && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {isQuickEntry
            ? `Added ${state.data.rawDescription} (${fmt.amount(state.data.amountMinor, { currency })}).`
            : 'Saved.'}
        </p>
      )}
    </form>
  );
}
