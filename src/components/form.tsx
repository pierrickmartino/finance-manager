import { useId, type ComponentProps, type ReactNode } from 'react';
import { PRIMARY_BUTTON_CLASS } from './surface';

const INPUT_CLASS =
  'rounded-md border border-rule-strong bg-surface px-3 py-1.5 text-sm placeholder:text-faint';

/** A `<label>` that wraps its control: the label's words, then the field below them. */
export const FIELD_LABEL_CLASS = 'flex flex-col gap-1 text-sm font-medium';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
}

export function TextField({ label, className, ...inputProps }: TextFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input id={id} className={`${INPUT_CLASS} ${className ?? ''}`} {...inputProps} />
    </div>
  );
}

interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'id'> {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function SelectField({ label, options, className, ...selectProps }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} className={`${INPUT_CLASS} ${className ?? ''}`} {...selectProps}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface SubmitButtonProps {
  isPending: boolean;
  children: ReactNode;
}

export function SubmitButton({ isPending, children }: SubmitButtonProps) {
  return (
    <button type="submit" disabled={isPending} className={PRIMARY_BUTTON_CLASS}>
      {children}
    </button>
  );
}

export function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-negative">
      {message}
    </p>
  );
}
