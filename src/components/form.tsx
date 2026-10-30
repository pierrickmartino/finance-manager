import { useId, type ComponentProps, type ReactNode } from 'react';

const INPUT_CLASS =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

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
    <button
      type="submit"
      disabled={isPending}
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
    >
      {children}
    </button>
  );
}

export function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}
