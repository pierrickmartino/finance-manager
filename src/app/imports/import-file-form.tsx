'use client';

import { useActionState, useId } from 'react';
import { FieldError, SubmitButton } from '@/components/form';
import type { ActionResult } from '@/server/actions';

interface ImportFileFormProps {
  formatLabel: string;
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}

/** Uploads a bank file; the server opens its preview. */
export function ImportFileForm({ formatLabel, action }: ImportFileFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          Bank file ({formatLabel})
        </label>
        <input id={id} name="file" type="file" required className="text-sm" />
      </div>
      <div>
        <SubmitButton isPending={isPending}>Preview import</SubmitButton>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
