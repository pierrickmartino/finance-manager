'use client';

import { useActionState, useId, useState, type ReactNode } from 'react';
import { FieldError } from '@/components/form';
import { useFormatter } from '@/components/formatter-provider';
import { CARD_CLASS } from '@/components/surface';
import type { DisplaySettings } from '@/lib/format';
import type { ActionResult } from '@/server/actions';
import { updateDisplaySettingsAction } from './actions';
import {
  dateFormatChoices,
  numberFormatChoices,
  SAMPLE_AMOUNT_MINOR,
  SAMPLE_DATE,
  type FormatChoice,
} from './view';

type Field = keyof DisplaySettings;

const NUMBER_CHOICES = numberFormatChoices();
const DATE_CHOICES = dateFormatChoices();

const ROW_CLASS = 'flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-sm';

/** One sentence, written through the shared formatter, of how amounts and dates look now. */
function Summary() {
  const fmt = useFormatter();
  const strong = 'font-semibold text-ink tabular-nums';
  return (
    <section aria-label="Summary" className="text-sm text-muted">
      Amounts look like{' '}
      <strong className={strong}>{fmt.amount(SAMPLE_AMOUNT_MINOR, { currency: 'CHF' })}</strong> and
      dates like <strong className={strong}>{fmt.date(SAMPLE_DATE)}</strong>. A choice saves as soon
      as you pick it.
    </section>
  );
}

interface ChoiceRowProps<T extends string> {
  label: string;
  field: Field;
  choices: FormatChoice<T>[];
  settings: DisplaySettings;
  isOpen: boolean;
  isPending: boolean;
  onToggle: () => void;
  formAction: (formData: FormData) => void;
}

/** A setting's row: shows the saved choice and expands into the list of choices. */
function ChoiceRow<T extends string>({
  label,
  field,
  choices,
  settings,
  isOpen,
  isPending,
  onToggle,
  formAction,
}: ChoiceRowProps<T>) {
  const panelId = useId();
  const saved = settings[field];
  const savedLabel = choices.find((choice) => choice.value === saved)?.label ?? saved;
  const otherField: Field = field === 'numberFormat' ? 'dateFormat' : 'numberFormat';

  return (
    <div className="border-t border-rule first:border-t-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className={`${ROW_CLASS} hover:bg-paper`}
      >
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-2 text-muted tabular-nums">
          {savedLabel}
          <span aria-hidden="true" className={`transition ${isOpen ? 'rotate-90' : ''}`}>
            ›
          </span>
        </span>
      </button>
      {isOpen && (
        <form id={panelId} action={formAction} className="px-4 pb-4">
          {/* The action saves both formats; the row only changes its own. */}
          <input type="hidden" name={otherField} value={settings[otherField]} />
          <ul className="flex flex-col divide-y divide-rule rounded-lg bg-paper">
            {choices.map((choice) => {
              const isSaved = choice.value === saved;
              return (
                <li key={choice.value}>
                  <button
                    type="submit"
                    name={field}
                    value={choice.value}
                    disabled={isPending}
                    aria-pressed={isSaved}
                    aria-label={`${choice.label} (${choice.hint})`}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-sunken disabled:opacity-50"
                  >
                    <span className="tabular-nums">{choice.label}</span>
                    <span className="flex items-center gap-3 text-muted">
                      {choice.hint}
                      <span aria-hidden="true" className="w-4 text-positive">
                        {isSaved ? '✓' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </form>
      )}
    </div>
  );
}

function StaticRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={`${ROW_CLASS} border-t border-rule`}>
      <span className="font-medium">{label}</span>
      <span className="text-muted">{children}</span>
    </div>
  );
}

/** The Display section: a summary, then one row per format that saves on pick. */
export function DisplaySection({ settings }: { settings: DisplaySettings }) {
  const [openField, setOpenField] = useState<Field | null>(null);
  const [state, formAction, isPending] = useActionState(
    async (previous: ActionResult<DisplaySettings> | null, formData: FormData) => {
      const result = await updateDisplaySettingsAction(previous, formData);
      if (result.ok) setOpenField(null);
      return result;
    },
    null,
  );
  const current = state?.ok ? state.data : settings;

  function rowProps(field: Field) {
    return {
      field,
      settings: current,
      isOpen: openField === field,
      isPending,
      onToggle: () => setOpenField(openField === field ? null : field),
      formAction,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <Summary />
      <div className={CARD_CLASS}>
        <ChoiceRow label="Number format" choices={NUMBER_CHOICES} {...rowProps('numberFormat')} />
        <ChoiceRow label="Date format" choices={DATE_CHOICES} {...rowProps('dateFormat')} />
        <StaticRow label="Language">English</StaticRow>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </div>
  );
}
