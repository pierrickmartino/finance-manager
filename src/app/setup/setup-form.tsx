'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FieldError, SubmitButton, TextField } from '@/components/form';
import { completeSetupAction } from './actions';

interface SetupFormProps {
  /** The authenticator to enrol; null once setup is complete. */
  enrolment: {
    secret: string;
    /** PNG data URL of the otpauth:// URI. */
    qrCode: string;
  } | null;
}

export function SetupForm({ enrolment }: SetupFormProps) {
  const [state, formAction, isPending] = useActionState(completeSetupAction, null);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Recovery codes</h2>
        <p className="text-sm">
          Each code signs you in once without the authenticator app. Store them somewhere safe: they
          are not shown again.
        </p>
        <ul
          aria-label="Recovery codes"
          className="grid grid-cols-2 gap-1 rounded-md border border-zinc-200 p-3 font-mono text-sm dark:border-zinc-800"
        >
          {state.data.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Link href="/" className="text-sm font-medium underline">
          I have saved them, continue
        </Link>
      </div>
    );
  }

  if (!enrolment) {
    return (
      <p className="text-sm">
        Setup is complete.{' '}
        <Link href="/" className="font-medium underline">
          Continue
        </Link>
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
      />
      <TextField
        label="Repeat password"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
      />
      <div className="flex flex-col gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise */}
        <img src={enrolment.qrCode} alt="Authenticator QR code" width={200} height={200} />
        <p className="text-sm">
          Can&apos;t scan it? Enter this key:{' '}
          <code data-testid="totp-secret" className="font-mono break-all">
            {enrolment.secret}
          </code>
        </p>
      </div>
      <input type="hidden" name="totpSecret" value={enrolment.secret} />
      <TextField
        label="Authenticator code"
        name="totpCode"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
      />
      <SubmitButton isPending={isPending}>Complete setup</SubmitButton>
      {state && !state.ok && <FieldError message={state.error} />}
    </form>
  );
}
