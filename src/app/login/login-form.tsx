'use client';

import { useActionState } from 'react';
import { FieldError, SubmitButton, TextField } from '@/components/form';
import { loginAction } from './actions';

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <TextField
        label="Authenticator or recovery code"
        name="code"
        autoComplete="one-time-code"
        required
      />
      <SubmitButton isPending={isPending}>Sign in</SubmitButton>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
