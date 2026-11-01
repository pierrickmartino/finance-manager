'use client';

// PROTOTYPE — one click classifies the whole group with a Category (and the Payee, if typed).
// Posts to the real bulk edit action with scope=group.
import { useActionState } from 'react';
import { FieldError } from '@/components/form';
import type { CategoryGroup } from '@/server/services/categories';
import type { BulkAction } from './shared';

interface QuickPickProps {
  groups: CategoryGroup[];
  payeeNames: string[];
  suggestedPayee: string;
  action: BulkAction;
}

export function QuickPick({ groups, payeeNames, suggestedPayee, action }: QuickPickProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="scope" value="group" />
      <label className="flex max-w-sm flex-col gap-1 text-sm font-medium">
        Payee <span className="font-normal text-zinc-500">(optional)</span>
        <input
          name="payee"
          list="quick-payee-names"
          defaultValue={suggestedPayee}
          autoComplete="off"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <datalist id="quick-payee-names">
          {payeeNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <fieldset key={group.id} className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">
              {group.name}
            </legend>
            <div className="flex flex-wrap gap-2">
              {group.categories.map((category) => (
                <button
                  key={category.id}
                  type="submit"
                  name="categoryId"
                  value={category.id}
                  disabled={isPending}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-sm hover:border-zinc-900 hover:bg-zinc-900 hover:text-white disabled:opacity-50 dark:border-zinc-700 dark:hover:border-white dark:hover:bg-white dark:hover:text-zinc-900"
                >
                  {category.name}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
