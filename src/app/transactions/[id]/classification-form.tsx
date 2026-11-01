'use client';

import { startTransition, useActionState } from 'react';
import { FieldError, SubmitButton } from '@/components/form';
import { MAX_NOTES_LENGTH } from '@/lib/classification';
import type { ActionResult } from '@/server/actions';
import type { CategoryGroup } from '@/server/services/categories';
import type { Classification } from '@/server/services/transactions';

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

interface ClassificationFormProps {
  classification: Classification;
  groups: CategoryGroup[];
  payeeNames: string[];
  tagNames: string[];
  action: (
    previous: ActionResult<unknown> | null,
    formData: FormData,
  ) => Promise<ActionResult<unknown>>;
}

const LOCKED = (
  <span className="text-xs font-normal text-amber-700 dark:text-amber-400">locked</span>
);

/** Payee, Category, Tags and notes of one Transaction (spec 63). Saving locks what changed. */
export function ClassificationForm({
  classification,
  groups,
  payeeNames,
  tagNames,
  action,
}: ClassificationFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const locked = new Set(classification.lockedFields);
  const isLocked = (field: Classification['lockedFields'][number]) => locked.has(field) && LOCKED;
  const splitCount = classification.splitLines.length;

  return (
    <form
      aria-label="Classification"
      // Submitted by hand so a rejected form keeps what was typed (React resets action forms).
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex max-w-xl flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>Payee {isLocked('payee')}</span>
        <input
          name="payee"
          list="payee-names"
          defaultValue={classification.payee?.name ?? ''}
          maxLength={100}
          autoComplete="off"
          className={INPUT}
        />
        <datalist id="payee-names">
          {payeeNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>Category {isLocked('category')}</span>
        <select
          name="categoryId"
          defaultValue={classification.category?.id ?? ''}
          // A split Transaction's Split lines hold its Categories (ADR-0004); a disabled field
          // is not submitted, so saving leaves the Category alone.
          disabled={splitCount > 0}
          className={`${INPUT} disabled:opacity-60`}
        >
          <option value="">{splitCount > 0 ? `Split (${splitCount})` : 'Unclassified'}</option>
          {groups.map((group) => (
            <optgroup key={group.id} label={group.name}>
              {group.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {splitCount > 0 && (
          <span className="text-xs font-normal text-zinc-500">
            Edit or remove the Split below to change the Categories.
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>Tags {isLocked('tags')}</span>
        <input
          name="tags"
          defaultValue={classification.tags.map((tag) => tag.name).join(', ')}
          placeholder={tagNames.slice(0, 3).join(', ') || 'Vacation 2024, Family'}
          autoComplete="off"
          className={INPUT}
        />
        <span className="text-xs font-normal text-zinc-500">Separate Tags with commas.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>Notes {isLocked('notes')}</span>
        <textarea
          name="notes"
          rows={3}
          maxLength={MAX_NOTES_LENGTH}
          defaultValue={classification.notes ?? ''}
          className={INPUT}
        />
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton isPending={isPending}>Save classification</SubmitButton>
        {state?.ok && <span className="text-sm text-zinc-500">Saved.</span>}
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
