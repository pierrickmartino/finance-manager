'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import { FieldError, SubmitButton } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { BUTTON_CLASS } from '@/components/named-list';
import { MAX_NOTES_LENGTH } from '@/lib/classification';
import type { ActionResult } from '@/server/actions';
import type { CategoryGroup } from '@/server/services/categories';
import { editableAmount, remainingMinor, type SplitLineDraft } from './split-lines';

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

const EMPTY_LINE: SplitLineDraft = { amount: '', categoryId: '', tags: '', note: '' };

/** A line being edited, with a key that stays the same while lines are added and removed. */
interface KeyedLine {
  key: number;
  draft: SplitLineDraft;
}

interface SplitFormProps {
  amountMinor: number;
  currency: string;
  initialLines: SplitLineDraft[];
  groups: CategoryGroup[];
  action: (
    previous: ActionResult<unknown> | null,
    formData: FormData,
  ) => Promise<ActionResult<unknown>>;
}

/**
 * Divides a Transaction's amount into Split lines (ADR-0004): each line has an amount, a
 * Category, Tags and a note, and the remaining unallocated amount updates as the user types.
 */
export function SplitForm({ amountMinor, currency, initialLines, groups, action }: SplitFormProps) {
  const fmt = useFormatter();
  const [state, formAction, isPending] = useActionState(action, null);
  const [lines, setLines] = useState<KeyedLine[]>(() =>
    initialLines.map((draft, index) => ({ key: index, draft })),
  );
  const nextKey = useRef(initialLines.length);
  const drafts = lines.map((line) => line.draft);
  const remaining = remainingMinor(
    amountMinor,
    drafts.map((draft) => draft.amount),
    fmt.settings.numberFormat,
    currency,
  );

  const update = (key: number, change: Partial<SplitLineDraft>) =>
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { key, draft: { ...line.draft, ...change } } : line,
      ),
    );
  const remove = (key: number) => setLines((current) => current.filter((line) => line.key !== key));
  const add = (draft: SplitLineDraft) => {
    const key = nextKey.current;
    nextKey.current += 1;
    setLines((current) => [...current, { key, draft }]);
  };

  return (
    <form
      aria-label="Split"
      // Submitted by hand so a rejected form keeps what was typed (React resets action forms).
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="flex flex-col gap-3"
    >
      {/* One structured payload: every line's fields together, in order. */}
      <input type="hidden" name="lines" value={JSON.stringify(drafts)} />
      <ol className="flex flex-col gap-2">
        {lines.map((line, index) => (
          <SplitLineFields
            key={line.key}
            line={line.draft}
            number={index + 1}
            groups={groups}
            onChange={(change) => update(line.key, change)}
            onRemove={lines.length > 1 ? () => remove(line.key) : undefined}
          />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={() =>
            add({
              ...EMPTY_LINE,
              // A new line takes what is left, so two lines balance at once.
              amount:
                remaining !== null && remaining !== 0
                  ? editableAmount(remaining, fmt.settings.numberFormat, currency)
                  : '',
            })
          }
        >
          Add line
        </button>
        <p aria-live="polite">
          Remaining:{' '}
          <span className="tabular-nums" data-testid="split-remaining">
            {remaining === null ? '—' : fmt.amount(remaining, { currency })}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton isPending={isPending}>Save Split</SubmitButton>
        {state?.ok && <span className="text-sm text-zinc-500">Saved.</span>}
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}

interface SplitLineFieldsProps {
  line: SplitLineDraft;
  number: number;
  groups: CategoryGroup[];
  onChange: (change: Partial<SplitLineDraft>) => void;
  /** Absent for the last remaining line. */
  onRemove?: () => void;
}

function SplitLineFields({ line, number, groups, onChange, onRemove }: SplitLineFieldsProps) {
  return (
    <li className="flex flex-wrap items-end gap-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Amount</span>
        <input
          aria-label={`Amount of line ${number}`}
          value={line.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          inputMode="decimal"
          autoComplete="off"
          className={`${INPUT} w-32 text-right tabular-nums`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Category</span>
        <select
          aria-label={`Category of line ${number}`}
          value={line.categoryId}
          onChange={(event) => onChange({ categoryId: event.target.value })}
          className={INPUT}
        >
          <option value="">Choose a Category</option>
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
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Tags</span>
        <input
          aria-label={`Tags of line ${number}`}
          value={line.tags}
          onChange={(event) => onChange({ tags: event.target.value })}
          placeholder="Renovation"
          autoComplete="off"
          className={`${INPUT} w-40`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Note</span>
        <input
          aria-label={`Note of line ${number}`}
          value={line.note}
          onChange={(event) => onChange({ note: event.target.value })}
          maxLength={MAX_NOTES_LENGTH}
          autoComplete="off"
          className={`${INPUT} w-48`}
        />
      </label>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove line ${number}`}
          onClick={onRemove}
          className={BUTTON_CLASS}
        >
          Remove
        </button>
      )}
    </li>
  );
}
