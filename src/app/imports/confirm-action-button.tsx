'use client';

import { useActionState } from 'react';
import { FieldError } from '@/components/form';
import type { ActionResult } from '@/server/actions';

interface ConfirmActionButtonProps {
  label: string;
  /** Accessible name when the label alone is ambiguous (one button per table row). */
  ariaLabel?: string;
  /** Asked with `window.confirm` before the action runs. */
  confirmMessage: string;
  action: (previous: ActionResult | null) => Promise<ActionResult>;
}

/** A button that runs a destructive server action after the user confirms it. */
export function ConfirmActionButton({
  label,
  ariaLabel,
  confirmMessage,
  action,
}: ConfirmActionButtonProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      <div>
        <button
          type="submit"
          aria-label={ariaLabel}
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {label}
        </button>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
