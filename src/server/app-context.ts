import 'server-only';
import { connection } from 'next/server';
import { getDb } from '@/server/db/client';
import type { ServiceContext } from '@/server/services/context';

/**
 * The service context for the current request. Every server component, server action and
 * route handler gets its context here and then calls a service operation; nothing else
 * touches the database. Auth (#4) will resolve the session here and reject anonymous calls.
 */
export async function getServiceContext(): Promise<ServiceContext> {
  // Data is per request: opt out of build-time prerendering.
  await connection();
  return { db: getDb(), actor: { type: 'manual', id: null } };
}
