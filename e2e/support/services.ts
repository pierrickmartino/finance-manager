import { createDb } from '../../src/server/db/client';
import type { ServiceContext } from '../../src/server/services/context';
import { databaseUrl } from '../../test/support/postgres';

/**
 * Calls `run` with a service context on this run's E2E database, as the manual actor, then
 * closes the connection. Specs seed and clean up their data with it.
 */
export async function withServices<T>(run: (ctx: ServiceContext) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl(process.env.E2E_DATABASE_NAME!));
  try {
    return await run({ db, actor: { type: 'manual', id: null } });
  } finally {
    await db.end();
  }
}
