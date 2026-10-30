'use client';

import { useActionState, type ReactNode } from 'react';
import { FieldError } from '@/components/form';
import type { ActionResult } from '@/server/actions';

interface ActionFormProps {
  action: (
    previous: ActionResult<unknown> | null,
    formData: FormData,
  ) => Promise<ActionResult<unknown>>;
  /** Accessible name of the form. */
  label: string;
  /** Asked with `window.confirm` before submitting, for destructive actions. */
  confirmMessage?: string;
  className?: string;
  children: ReactNode;
}

/** A small form bound to one server action, showing the action's error under it. */
export function ActionForm({
  action,
  label,
  confirmMessage,
  className,
  children,
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      aria-label={label}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      <div className={className ?? 'flex flex-wrap items-end gap-2'}>{children}</div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
