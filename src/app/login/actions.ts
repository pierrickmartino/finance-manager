'use server';

import { redirect } from 'next/navigation';
import { formText, runAction, type ActionResult } from '@/server/actions';
import { getPublicServiceContext } from '@/server/app-context';
import { login, logout } from '@/server/services/auth';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '@/server/session-cookie';

export async function loginAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    login(await getPublicServiceContext(), {
      password: formText(formData, 'password'),
      code: formText(formData, 'code'),
    }),
  );
  if (!result.ok) return result;
  await setSessionCookie(result.data.token);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await logout(await getPublicServiceContext(), token);
  await clearSessionCookie();
  redirect('/login');
}
