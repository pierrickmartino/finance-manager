'use client';

import { startTransition, useActionState, useRef, useState, type ReactNode } from 'react';
import { FieldError, SubmitButton } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { BUTTON_CLASS } from '@/components/named-list';
import { MAX_NOTES_LENGTH } from '@/lib/classification';
import type { ActionResult } from '@/server/actions';
import type { CategoryGroup } from '@/server/services/categories';
import type { PayeeRef } from '@/server/services/payees';
import { AllocationBar, lineColor } from './allocation-bar';
import { editableAmount, splitAllocation, type SplitLineDraft } from './split-lines';

const INPUT =
  'w-full min-w-0 rounded-md border border-rule-strong bg-surface px-2.5 py-1.5 text-sm';

/**
 * One row per line from `md` up, like a spreadsheet: marker, Category, Payee, Tags, Note,
 * Amount, actions. Narrower, each line wraps into a two-column card.
 */
const ROW =
  'grid grid-cols-2 items-end gap-2 md:grid-cols-[2rem_minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(7rem,1fr)_minmax(8rem,1.3fr)_8rem_6.5rem] md:items-center';

/** A field's visible name, shown above it only where the column headers are hidden. */
const FIELD_NAME = 'text-xs text-muted md:sr-only';

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
  /** The Payees a line may name (ADR-0006). */
  payees: PayeeRef[];
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
 * Category, a Payee (blank: the Transaction's, ADR-0006), Tags and a note. A bar shows how the
 * lines divide the amount and what remains, updating as the user types; a line can take what
 * remains. A Transfer line (ADR-0005) shows its Transfer instead of a Category and can't be
 * removed.
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
  const numberFormat = fmt.settings.numberFormat;
  const [state, formAction, isPending] = useActionState(action, null);
  const [lines, setLines] = useState<KeyedLine[]>(() =>
    initialLines.map((draft, index) => ({ key: index, draft })),
  );
  const nextKey = useRef(initialLines.length);
  const drafts = lines.map((line) => line.draft);
  const allocation = splitAllocation(
    amountMinor,
    drafts.map((draft) => draft.amount),
    numberFormat,
    currency,
  );
  const { remaining } = allocation;
  const asEditable = (minor: number) => editableAmount(minor, numberFormat, currency);

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
      className="flex flex-col gap-4"
    >
      {/* One structured payload: every line's fields together, in order. */}
      <input type="hidden" name="lines" value={JSON.stringify(drafts)} />
      <AllocationBar
        totalMinor={amountMinor}
        allocation={allocation}
        formatAmount={(minor) => fmt.amount(minor, { currency })}
      />
      <div className="flex flex-col">
        <div
          aria-hidden="true"
          className={`${ROW} hidden border-b border-rule pb-1.5 text-xs text-muted md:grid`}
        >
          <span />
          <span>Category</span>
          <span>Payee</span>
          <span>Tags</span>
          <span>Note</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <ol className="flex flex-col divide-y divide-rule">
          {lines.map((line, index) => (
            <SplitLineFields
              key={line.key}
              line={line.draft}
              index={index}
              groups={groups}
              payees={payees}
              transactionPayee={transactionPayee}
              transfer={line.draft.isTransfer && (transfers[line.draft.id ?? ''] ?? 'Transfer')}
              onChange={(change) => update(line.key, change)}
              onTakeRest={
                remaining
                  ? () =>
                      update(line.key, {
                        amount: asEditable((allocation.parts[index] ?? 0) + remaining),
                      })
                  : undefined
              }
              onRemove={
                lines.length > 1 && !line.draft.isTransfer ? () => remove(line.key) : undefined
              }
            />
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className={BUTTON_CLASS}
          // A new line takes what is left, so two lines balance at once.
          onClick={() => add({ ...EMPTY_LINE, amount: remaining ? asEditable(remaining) : '' })}
        >
          Add line
        </button>
        <span className="ml-auto" />
        {state?.ok && <span className="text-muted">Saved.</span>}
        <SubmitButton isPending={isPending}>Save Split</SubmitButton>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}

interface SplitLineFieldsProps {
  line: SplitLineDraft;
  /** 0-based position; lines are numbered from 1. */
  index: number;
  groups: CategoryGroup[];
  payees: PayeeRef[];
  transactionPayee: string | null;
  /** What a Transfer line shows in place of its Category and Payee; falsy for other lines. */
  transfer: ReactNode;
  onChange: (change: Partial<SplitLineDraft>) => void;
  /** Absent while nothing remains to allocate. */
  onTakeRest?: () => void;
  /** Absent for the last remaining line and for a Transfer line. */
  onRemove?: () => void;
}

function SplitLineFields({
  line,
  index,
  groups,
  payees,
  transactionPayee,
  transfer,
  onChange,
  onTakeRest,
  onRemove,
}: SplitLineFieldsProps) {
  const number = index + 1;
  return (
    <li className={`${ROW} py-2 text-sm`}>
      <span className="col-span-2 flex items-center gap-1.5 text-xs text-muted md:col-span-1">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${lineColor(index)}`}
        />
        <span>
          <span className="md:sr-only">Line </span>
          {number}
        </span>
      </span>
      {transfer ? (
        <div className="col-span-2 flex flex-col gap-1" data-testid={`transfer of line ${number}`}>
          <span className={FIELD_NAME}>Transfer</span>
          <span className="text-info">{transfer}</span>
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
        <span className={FIELD_NAME}>Tags</span>
        <input
          aria-label={`Tags of line ${number}`}
          value={line.tags}
          onChange={(event) => onChange({ tags: event.target.value })}
          placeholder="Renovation"
          autoComplete="off"
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={FIELD_NAME}>Note</span>
        <input
          aria-label={`Note of line ${number}`}
          value={line.note}
          onChange={(event) => onChange({ note: event.target.value })}
          maxLength={MAX_NOTES_LENGTH}
          autoComplete="off"
          className={INPUT}
        />
      </label>
      <label className="col-span-2 flex flex-col gap-1 md:col-span-1">
        <span className={FIELD_NAME}>Amount</span>
        <input
          aria-label={`Amount of line ${number}`}
          value={line.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          inputMode="decimal"
          autoComplete="off"
          className={`${INPUT} text-right tabular-nums`}
        />
      </label>
      <span className="col-span-2 flex justify-end gap-1 md:col-span-1">
        {onTakeRest && (
          <button
            type="button"
            aria-label={`Add what remains to line ${number}`}
            title="Add what remains to this line"
            onClick={onTakeRest}
            className="rounded-md px-1.5 py-1 text-xs font-medium text-ink-soft hover:bg-sunken"
          >
            + rest
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove line ${number}`}
            title="Remove this line"
            onClick={onRemove}
            className="rounded-md px-2 py-1 text-muted hover:bg-negative-tint hover:text-negative"
          >
            ✕
          </button>
        )}
      </span>
    </li>
  );
}

type CategoryPickerProps = Pick<SplitLineFieldsProps, 'line' | 'groups' | 'onChange'> & {
  number: number;
};

function CategoryPicker({ line, number, groups, onChange }: CategoryPickerProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className={FIELD_NAME}>Category</span>
      <select
        aria-label={`Category of line ${number}`}
        value={line.categoryId}
        onChange={(event) => onChange({ categoryId: event.target.value })}
        className={`${INPUT} ${line.categoryId === '' ? 'text-muted' : ''}`}
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
  'line' | 'payees' | 'transactionPayee' | 'onChange'
> & { number: number };

/**
 * A line's own Payee (ADR-0006). Blank by default, showing the Transaction's Payee it then
 * takes; a Payee picked here stays, even when it equals the Transaction's.
 */
function PayeePicker({ line, number, payees, transactionPayee, onChange }: PayeePickerProps) {
  const payeeId = line.payeeId ?? '';
  return (
    <label className="flex flex-col gap-1">
      <span className={FIELD_NAME}>Payee</span>
      <select
        aria-label={`Payee of line ${number}`}
        value={payeeId}
        onChange={(event) => onChange({ payeeId: event.target.value })}
        className={`${INPUT} ${payeeId === '' ? 'text-muted' : ''}`}
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
