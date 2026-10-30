import 'server-only';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';
import { getDb } from '@/server/db/client';
import { getSession, type Session } from '@/server/services/auth';
import type { ServiceContext } from '@/server/services/context';
import { readSessionToken } from '@/server/session-cookie';

/**
 * A context without a session check. Only for what must work signed out: login, setup,
 * the health check and the display formats the shared layout renders with.
 */
export async function getPublicServiceContext(): Promise<ServiceContext> {
  // Data is per request: opt out of build-time prerendering.
  await connection();
  return { db: getDb(), actor: { type: 'manual', id: null } };
}

/** The signed-in session for this request, or null. Checked once per request. */
export const getCurrentSession = cache(async (): Promise<Session | null> => {
  const ctx = await getPublicServiceContext();
  const token = await readSessionToken();
  return token ? getSession(ctx, token) : null;
});

/**
 * The service context for the current request. Every server component, server action and
 * route handler gets its context here and then calls a service operation; nothing else
 * touches the database. Without a valid session it redirects to /login (in a server action
 * too: `runAction` lets the redirect through), so no protected operation runs signed out.
 */
export async function getServiceContext(): Promise<ServiceContext> {
  if (!(await getCurrentSession())) redirect('/login');
  return getPublicServiceContext();
}
