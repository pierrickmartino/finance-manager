'use client';

import { useActionState, useState } from 'react';
import { FieldError, SubmitButton, TextField } from '@/components/form';
import type { ActionResult } from '@/server/actions';
import type { Bank } from '@/server/services/banks';
import { createBankAction } from './actions';

interface CreateBankFormProps {
  /** Called with the Bank once it is created. */
  onCreated?: (bank: Bank) => void;
}

export function CreateBankForm({ onCreated }: CreateBankFormProps) {
  const [name, setName] = useState('');
  const [state, formAction, isPending] = useActionState(
    async (previous: ActionResult<Bank> | null, formData: FormData) => {
      const result = await createBankAction(previous, formData);
      if (result.ok) {
        setName('');
        onCreated?.(result.data);
      }
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <TextField
          label="Bank name"
          name="name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <SubmitButton isPending={isPending}>Add Bank</SubmitButton>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
