import 'server-only';
import { cookies } from 'next/headers';

/** Shared with `src/proxy.ts`, which only checks that the cookie is present. */
export const SESSION_COOKIE = 'fm_session';

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * A browser-session cookie: httpOnly, Secure (browsers accept it on http://localhost too) and
 * SameSite=Lax. Expiry is enforced server-side, after SESSION_IDLE_TIMEOUT_MS of inactivity.
 */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
