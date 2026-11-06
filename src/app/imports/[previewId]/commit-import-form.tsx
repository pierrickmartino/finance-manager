'use client';

import { useActionState, type ReactNode } from 'react';
import { FieldError, SubmitButton } from '@/components/form';
import type { ActionResult } from '@/server/actions';

interface CommitImportFormProps {
  /** The proposed opening balance, already formatted; null when none is proposed. */
  proposedOpening: string | null;
  newCount: number;
  commit: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  discard: (previous: ActionResult | null) => Promise<ActionResult>;
  /** Extra fields submitted with the commit (the near-duplicate choices). */
  children?: ReactNode;
}

export function CommitImportForm({
  proposedOpening,
  newCount,
  commit,
  discard,
  children,
}: CommitImportFormProps) {
  const [commitState, commitAction, isCommitting] = useActionState(commit, null);
  const [discardState, discardAction, isDiscarding] = useActionState(discard, null);
  const error =
    (commitState && !commitState.ok && commitState.error) ||
    (discardState && !discardState.ok && discardState.error);

  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-4">
      <form action={commitAction} className="flex flex-col gap-3">
        {children}
        {proposedOpening && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="acceptOpeningBalance" defaultChecked />
            Use {proposedOpening} as the Account&apos;s opening balance
          </label>
        )}
        <div className="flex gap-3">
          <SubmitButton isPending={isCommitting || isDiscarding}>
            Commit import ({newCount} new)
          </SubmitButton>
          <button
            type="submit"
            formAction={discardAction}
            disabled={isCommitting || isDiscarding}
            className="rounded-md border border-rule-strong px-3 py-1.5 text-sm font-medium hover:bg-sunken disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      </form>
      {error && <FieldError message={error} />}
    </div>
  );
}
