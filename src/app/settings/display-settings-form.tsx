'use client';

import { useActionState } from 'react';
import { FieldError, SelectField, SubmitButton } from '@/components/form';
import { DATE_FORMATS, NUMBER_FORMATS, type DisplaySettings } from '@/lib/format';
import { updateDisplaySettingsAction } from './actions';

const NUMBER_FORMAT_OPTIONS = Object.entries(NUMBER_FORMATS).map(([value, format]) => ({
  value,
  label: format.example,
}));

const DATE_FORMAT_OPTIONS = DATE_FORMATS.map((format) => ({ value: format, label: format }));

export function DisplaySettingsForm({ settings }: { settings: DisplaySettings }) {
  const [state, formAction, isPending] = useActionState(updateDisplaySettingsAction, null);
  const current = state?.ok ? state.data : settings;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label="Number format"
          name="numberFormat"
          options={NUMBER_FORMAT_OPTIONS}
          defaultValue={current.numberFormat}
        />
        <SelectField
          label="Date format"
          name="dateFormat"
          options={DATE_FORMAT_OPTIONS}
          defaultValue={current.dateFormat}
        />
        <SubmitButton isPending={isPending}>Save</SubmitButton>
      </div>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
