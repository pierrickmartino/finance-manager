'use client';

import { useActionState } from 'react';
import { FieldError, SubmitButton } from '@/components/form';
import type { ActionResult } from '@/server/actions';
import type { ApplyRulesResult } from '@/server/services/rules';

interface ApplyFormProps {
  action: (
    previous: ActionResult<ApplyRulesResult> | null,
    formData: FormData,
  ) => Promise<ActionResult<ApplyRulesResult>>;
  count: number;
}

/** Commits the preview shown above it. */
export function ApplyForm({ action, count }: ApplyFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const noun = count === 1 ? 'Transaction' : 'Transactions';
  return (
    <form action={formAction} aria-label="Apply Rules" className="flex flex-col gap-2">
      {count > 0 && (
        <div>
          <SubmitButton isPending={isPending}>{`Apply to ${count} ${noun}`}</SubmitButton>
        </div>
      )}
      {state && !state.ok && <FieldError message={state.error} />}
      {state?.ok && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {`Applied to ${state.data.count} ${state.data.count === 1 ? 'Transaction' : 'Transactions'}.`}
        </p>
      )}
    </form>
  );
}
