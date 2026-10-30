import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentSession, getPublicServiceContext } from '@/server/app-context';
import { getAuthStatus } from '@/server/services/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in · Finance Manager' };

export default async function LoginPage() {
  if (!(await getAuthStatus(await getPublicServiceContext())).isSetUp) redirect('/setup');
  if (await getCurrentSession()) redirect('/');

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <LoginForm />
    </section>
  );
}
