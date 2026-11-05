'use client';

import { startTransition, useActionState, useRef, useState, type ReactNode } from 'react';
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

/** A Payee a Split line may name. */
export interface LinePayeeOption {
  id: string;
  name: string;
}

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
  /** The Payees a line may name (ADR-0006). */
  payees: LinePayeeOption[];
  /** The Transaction's Payee name: what a line without its own Payee reports under. */
  transactionPayee: string | null;
  /** By Split line id: what a Transfer line shows in place of its Category, its other side. */
  transfers: Record<string, ReactNode>;
  action: (
    previous: ActionResult<unknown> | null,
    formData: FormData,
  ) => Promise<ActionResult<unknown>>;
}

/**
 * Divides a Transaction's amount into Split lines (ADR-0004): each line has an amount, a
 * Category, a Payee (blank: the Transaction's, ADR-0006), Tags and a note, and the remaining unallocated amount updates as the user types.
 * A Transfer line (ADR-0005) shows its Transfer instead of a Category and can't be removed.
 */
export function SplitForm({
  amountMinor,
  currency,
  initialLines,
  groups,
  payees,
  transactionPayee,
  transfers,
  action,
}: SplitFormProps) {
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
            payees={payees}
            transactionPayee={transactionPayee}
            transfer={line.draft.isTransfer && (transfers[line.draft.id ?? ''] ?? 'Transfer')}
            onChange={(change) => update(line.key, change)}
            onRemove={
              lines.length > 1 && !line.draft.isTransfer ? () => remove(line.key) : undefined
            }
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
  payees: LinePayeeOption[];
  transactionPayee: string | null;
  /** What a Transfer line shows in place of its Category picker; falsy for other lines. */
  transfer: ReactNode;
  onChange: (change: Partial<SplitLineDraft>) => void;
  /** Absent for the last remaining line and for a Transfer line. */
  onRemove?: () => void;
}

function SplitLineFields({
  line,
  number,
  groups,
  payees,
  transactionPayee,
  transfer,
  onChange,
  onRemove,
}: SplitLineFieldsProps) {
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
      {transfer ? (
        <div className="flex flex-col gap-1" data-testid={`transfer of line ${number}`}>
          <span className="text-xs text-zinc-500">Transfer</span>
          <span className="py-1.5 text-sky-700 dark:text-sky-400">{transfer}</span>
        </div>
      ) : (
        <>
          <CategoryPicker line={line} number={number} groups={groups} onChange={onChange} />
          <PayeePicker
            line={line}
            number={number}
            payees={payees}
            transactionPayee={transactionPayee}
            onChange={onChange}
          />
        </>
      )}
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

type CategoryPickerProps = Pick<SplitLineFieldsProps, 'line' | 'number' | 'groups' | 'onChange'>;

function CategoryPicker({ line, number, groups, onChange }: CategoryPickerProps) {
  return (
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
  );
}

type PayeePickerProps = Pick<
  SplitLineFieldsProps,
  'line' | 'number' | 'payees' | 'transactionPayee' | 'onChange'
>;

/**
 * A line's own Payee (ADR-0006). Blank by default, showing the Transaction's Payee it then
 * takes; a Payee picked here stays, even when it equals the Transaction's.
 */
function PayeePicker({ line, number, payees, transactionPayee, onChange }: PayeePickerProps) {
  const payeeId = line.payeeId ?? '';
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">Payee</span>
      <select
        aria-label={`Payee of line ${number}`}
        value={payeeId}
        onChange={(event) => onChange({ payeeId: event.target.value })}
        className={`${INPUT} ${payeeId === '' ? 'text-zinc-500' : ''}`}
      >
        <option value="">{transactionPayee ?? 'No Payee'}</option>
        {payees.map((payee) => (
          <option key={payee.id} value={payee.id}>
            {payee.name}
          </option>
        ))}
      </select>
    </label>
  );
}
