'use client';

import { useActionState } from 'react';
import { FieldError } from '@/components/form';
import type { ActionResult } from '@/server/actions';

interface DeleteButtonProps {
  action: (previous: ActionResult<null> | null) => Promise<ActionResult<null>>;
  /** Accessible name, e.g. "Delete Coop (14.03.2025)". */
  label: string;
  confirmation: string;
  children?: string;
}

export function DeleteButton({
  action,
  label,
  confirmation,
  children = 'Delete',
}: DeleteButtonProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
      className="inline-flex flex-col gap-1"
    >
      <button
        type="submit"
        aria-label={label}
        disabled={isPending}
        className="text-sm text-red-700 underline hover:no-underline disabled:opacity-50 dark:text-red-400"
      >
        {children}
      </button>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
