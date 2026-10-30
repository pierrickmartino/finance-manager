'use client';

import { useActionState, useRef, startTransition, type FormEvent } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { FieldError, SelectField, SubmitButton, TextField } from '@/components/form';
import type { ActionResult } from '@/server/actions';
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_KINDS,
  IMPORT_FORMAT_LABELS,
  IMPORT_FORMATS,
} from '@/server/services/accounts/input';
import type { Account } from '@/server/services/accounts';
import type { Bank } from '@/server/services/banks';

const OFFERED_CURRENCIES = ['CHF', 'EUR'];

const KIND_OPTIONS = ACCOUNT_KINDS.map((kind) => ({
  value: kind,
  label: ACCOUNT_KIND_LABELS[kind],
}));

const FORMAT_OPTIONS = [
  { value: '', label: 'None (manual)' },
  ...IMPORT_FORMATS.map((format) => ({ value: format, label: IMPORT_FORMAT_LABELS[format] })),
];

type AccountAction = (
  previous: ActionResult<Account> | null,
  formData: FormData,
) => Promise<ActionResult<Account>>;

interface AccountFormProps {
  banks: Bank[];
  action: AccountAction;
  submitLabel: string;
  /** Prefills the form for editing. */
  account?: Account;
}

export function AccountForm({ banks, action, submitLabel, account }: AccountFormProps) {
  const fmt = useFormatter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (previous: ActionResult<Account> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok && !account) formRef.current?.reset();
      return result;
    },
    null,
  );

  // Submit through the action without React's automatic form reset, so a rejected
  // form keeps what the user typed.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  const currencies = [...new Set([...OFFERED_CURRENCIES, account?.currency ?? 'CHF'])];

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Bank"
          name="bankId"
          required
          defaultValue={account?.bankId}
          options={banks.map((bank) => ({ value: bank.id, label: bank.name }))}
        />
        <TextField
          label="Account name"
          name="name"
          required
          maxLength={100}
          defaultValue={account?.name}
        />
        <SelectField
          label="Currency"
          name="currency"
          defaultValue={account?.currency ?? 'CHF'}
          options={currencies.map((code) => ({ value: code, label: code }))}
        />
        <SelectField label="Kind" name="kind" defaultValue={account?.kind} options={KIND_OPTIONS} />
        <TextField label="IBAN" name="iban" defaultValue={account?.iban ?? ''} />
        <SelectField
          label="Import format"
          name="importFormat"
          defaultValue={account?.importFormat ?? ''}
          options={FORMAT_OPTIONS}
        />
        <TextField
          label="Opening balance"
          name="openingBalance"
          inputMode="decimal"
          placeholder={fmt.amount(0)}
          defaultValue={account ? fmt.amount(account.openingBalanceMinor) : ''}
        />
        <TextField
          label="Opening date"
          name="openingDate"
          type="date"
          defaultValue={account?.openingDate ?? ''}
        />
      </div>
      <div>
        <SubmitButton isPending={isPending}>{submitLabel}</SubmitButton>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
      {state?.ok && account && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Saved.
        </p>
      )}
    </form>
  );
}
