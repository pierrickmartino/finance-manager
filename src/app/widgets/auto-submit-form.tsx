'use client';

import Form from 'next/form';
import { useRef, type FormEvent, type ReactNode } from 'react';

/** Fields typed into rather than picked: they update the preview once left, not per keystroke. */
const TYPED_INPUTS = new Set(['number', 'date', 'text']);

function isTyped(target: EventTarget): boolean {
  return target instanceof HTMLInputElement && TYPED_INPUTS.has(target.type);
}

interface AutoSubmitFormProps {
  /** The page the GET form navigates to, with the fields as its URL parameters. */
  action: string;
  /** Accessible name of the form. */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * A GET form that resubmits itself whenever a field changes, so the page it serves (the Widget
 * editor's preview) follows every edit. It navigates client-side, replacing the history entry
 * and keeping the scroll position. Typed fields wait until they lose focus, or Enter.
 */
export function AutoSubmitForm({ action, label, className, children }: AutoSubmitFormProps) {
  const pendingTyped = useRef(false);

  const onChange = (event: FormEvent<HTMLFormElement>) => {
    if (isTyped(event.target)) {
      pendingTyped.current = true;
      return;
    }
    event.currentTarget.requestSubmit();
  };

  const onBlur = (event: FormEvent<HTMLFormElement>) => {
    if (!pendingTyped.current || !isTyped(event.target)) return;
    pendingTyped.current = false;
    event.currentTarget.requestSubmit();
  };

  return (
    <Form
      action={action}
      replace
      scroll={false}
      aria-label={label}
      className={className}
      onChange={onChange}
      onBlur={onBlur}
      onSubmit={() => {
        pendingTyped.current = false;
      }}
    >
      {children}
    </Form>
  );
}
