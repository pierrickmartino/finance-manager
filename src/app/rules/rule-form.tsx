'use client';

import { useActionState, useState } from 'react';
import { FieldError } from '@/components/form';
import { BUTTON_CLASS, INPUT_CLASS } from '@/components/named-list';
import type { ActionResult } from '@/server/actions';
import {
  CONDITION_KIND_LABELS,
  emptyCondition,
  OPERATOR_OPTIONS,
  type ConditionDraft,
  type ConditionKind,
  type RuleDraft,
} from './rule-form-model';

interface Option {
  id: string;
  name: string;
}

export interface RuleFormOptions {
  accounts: Option[];
  payees: Option[];
  categoryGroups: { id: string; name: string; categories: Option[] }[];
  tags: Option[];
}

interface RuleFormProps {
  initial: RuleDraft;
  options: RuleFormOptions;
  action: (
    previous: ActionResult<unknown> | null,
    formData: FormData,
  ) => Promise<ActionResult<unknown>>;
  submitLabel: string;
}

const KINDS = Object.keys(CONDITION_KIND_LABELS) as ConditionKind[];

function toggle(ids: readonly string[], id: string, isOn: boolean): string[] {
  return isOn ? [...ids.filter((other) => other !== id), id] : ids.filter((other) => other !== id);
}

interface ConditionRowProps {
  index: number;
  condition: ConditionDraft;
  accounts: Option[];
  onChange: (condition: ConditionDraft) => void;
  onRemove: () => void;
}

function ConditionRow({ index, condition, accounts, onChange, onRemove }: ConditionRowProps) {
  const label = `Condition ${index + 1}`;
  const operators = OPERATOR_OPTIONS[condition.kind];
  const isBetween = condition.operator === 'between';
  const isDate = condition.kind === 'bookingDate';
  const set = (changes: Partial<ConditionDraft>) => onChange({ ...condition, ...changes });

  return (
    <li className="flex flex-wrap items-center gap-2" aria-label={label}>
      <select
        aria-label={`${label} field`}
        value={condition.kind}
        onChange={(event) => onChange(emptyCondition(event.target.value as ConditionKind))}
        className={INPUT_CLASS}
      >
        {KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {CONDITION_KIND_LABELS[kind]}
          </option>
        ))}
      </select>
      {operators && (
        <select
          aria-label={`${label} operator`}
          value={condition.operator}
          onChange={(event) => set({ operator: event.target.value })}
          className={INPUT_CLASS}
        >
          {operators.map((operator) => (
            <option key={operator.value} value={operator.value}>
              {operator.label}
            </option>
          ))}
        </select>
      )}
      {operators && (
        <input
          aria-label={`${label} value`}
          type={isDate ? 'date' : 'text'}
          inputMode={condition.kind === 'amount' ? 'decimal' : undefined}
          value={condition.value}
          onChange={(event) => set({ value: event.target.value })}
          required
          className={INPUT_CLASS}
        />
      )}
      {operators && isBetween && (
        <>
          <span className="text-sm">and</span>
          <input
            aria-label={`${label} to`}
            type={isDate ? 'date' : 'text'}
            inputMode={condition.kind === 'amount' ? 'decimal' : undefined}
            value={condition.to}
            onChange={(event) => set({ to: event.target.value })}
            required
            className={INPUT_CLASS}
          />
        </>
      )}
      {condition.kind === 'direction' && (
        <select
          aria-label={`${label} direction`}
          value={condition.direction}
          onChange={(event) => set({ direction: event.target.value as 'in' | 'out' })}
          className={INPUT_CLASS}
        >
          <option value="out">is money out</option>
          <option value="in">is money in</option>
        </select>
      )}
      {condition.kind === 'account' && (
        <fieldset className="flex flex-wrap gap-2 text-sm">
          <legend className="sr-only">{`${label} Accounts`}</legend>
          <span>is one of</span>
          {accounts.map((account) => (
            <label key={account.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={condition.accountIds.includes(account.id)}
                onChange={(event) =>
                  set({
                    accountIds: toggle(condition.accountIds, account.id, event.target.checked),
                  })
                }
              />
              {account.name}
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="button"
        onClick={onRemove}
        className={BUTTON_CLASS}
        aria-label={`Remove ${label.toLowerCase()}`}
      >
        Remove
      </button>
    </li>
  );
}

/** Creates or edits a Rule: name, AND-ed conditions, actions (spec 69-74). */
export function RuleForm({ initial, options, action, submitLabel }: RuleFormProps) {
  const [draft, setDraft] = useState(initial);
  const [state, formAction, isPending] = useActionState(action, null);
  const set = (changes: Partial<RuleDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const setCondition = (index: number, condition: ConditionDraft) =>
    set({ conditions: draft.conditions.map((old, i) => (i === index ? condition : old)) });

  return (
    <form action={formAction} aria-label="Rule" className="flex flex-col gap-5">
      <input type="hidden" name="rule" value={JSON.stringify(draft)} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Name
        <input
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          required
          maxLength={100}
          className={INPUT_CLASS}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">When all of these match</legend>
        <ol className="flex flex-col gap-2">
          {draft.conditions.map((condition, index) => (
            <ConditionRow
              key={index}
              index={index}
              condition={condition}
              accounts={options.accounts}
              onChange={(next) => setCondition(index, next)}
              onRemove={() => set({ conditions: draft.conditions.filter((_, i) => i !== index) })}
            />
          ))}
        </ol>
        <div>
          <button
            type="button"
            onClick={() => set({ conditions: [...draft.conditions, emptyCondition()] })}
            className={BUTTON_CLASS}
          >
            Add condition
          </button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Then</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Set Payee
            <select
              value={draft.payeeId}
              onChange={(event) => set({ payeeId: event.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">(don’t set)</option>
              {options.payees.map((payee) => (
                <option key={payee.id} value={payee.id}>
                  {payee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Set Category
            <select
              value={draft.categoryId}
              onChange={(event) => set({ categoryId: event.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">(don’t set)</option>
              {options.categoryGroups.map((group) => (
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
        </div>
        {options.tags.length > 0 && (
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="mb-1">Add Tags</legend>
            {options.tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={draft.tagIds.includes(tag.id)}
                  onChange={(event) =>
                    set({ tagIds: toggle(draft.tagIds, tag.id, event.target.checked) })
                  }
                />
                {tag.name}
              </label>
            ))}
          </fieldset>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => set({ enabled: event.target.checked })}
        />
        Enabled
      </label>

      {state && !state.ok && <FieldError message={state.error} />}
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
