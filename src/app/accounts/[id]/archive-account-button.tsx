'use client';

import { useActionState } from 'react';
import { FieldError } from '@/components/form';
import type { ActionResult } from '@/server/actions';
import type { Account } from '@/server/services/accounts';

interface ArchiveAccountButtonProps {
  action: (previous: ActionResult<Account> | null) => Promise<ActionResult<Account>>;
}

export function ArchiveAccountButton({ action }: ArchiveAccountButtonProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm('Archive this Account? It stays in History and in past reports.')) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
    >
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Archive Account
        </button>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
