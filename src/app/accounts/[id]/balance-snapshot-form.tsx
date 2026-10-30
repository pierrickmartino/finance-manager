'use client';

import { startTransition, useActionState, useRef, type FormEvent } from 'react';
import { useFormatter } from '@/components/formatter-provider';
import { FieldError, SubmitButton, TextField } from '@/components/form';
import type { ActionResult } from '@/server/actions';
import type { BalanceSnapshot } from '@/server/services/balance-snapshots';

interface BalanceSnapshotFormProps {
  action: (
    previous: ActionResult<BalanceSnapshot> | null,
    formData: FormData,
  ) => Promise<ActionResult<BalanceSnapshot>>;
  currency: string;
}

export function BalanceSnapshotForm({ action, currency }: BalanceSnapshotFormProps) {
  const fmt = useFormatter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (previous: ActionResult<BalanceSnapshot> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  // A rejected form keeps what was typed (React resets forms after `action=` submissions).
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_12rem_auto] sm:items-end">
        <TextField label="Snapshot date" name="date" type="date" required />
        <TextField
          label={`Balance (${currency})`}
          name="balance"
          inputMode="decimal"
          required
          autoComplete="off"
          placeholder={fmt.amount(0)}
        />
        <div>
          <SubmitButton isPending={isPending}>Add Balance snapshot</SubmitButton>
        </div>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
