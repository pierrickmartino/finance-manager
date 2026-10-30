import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { getCurrentSession, getPublicServiceContext } from '@/server/app-context';
import { createTotpEnrolment, getAuthStatus } from '@/server/services/auth';
import { SetupForm } from './setup-form';

export const metadata: Metadata = { title: 'Set up · Finance Manager' };

/** First-run setup. Once completed it is gone for good: the route sends you to /login. */
export default async function SetupPage() {
  const ctx = await getPublicServiceContext();
  if ((await getAuthStatus(ctx)).isSetUp) {
    // Completing setup sets the session cookie, and Next.js then re-renders this page. Keep the
    // form mounted for the signed-in user so it can still show the recovery codes.
    if (!(await getCurrentSession())) redirect('/login');
    return (
      <SetupLayout>
        <SetupForm enrolment={null} />
      </SetupLayout>
    );
  }

  const { secret, uri } = createTotpEnrolment();
  const qrCode = await QRCode.toDataURL(uri, { margin: 1, width: 200 });
  return (
    <SetupLayout>
      <SetupForm enrolment={{ secret, qrCode }} />
    </SetupLayout>
  );
}

function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Set up Finance Manager</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Choose a password and add Finance Manager to an authenticator app. You need both to sign in.
      </p>
      {children}
    </section>
  );
}
