import { createDb } from '../../src/server/db/client';
import type { ServiceContext } from '../../src/server/services/context';
import { databaseUrl } from '../../test/support/postgres';

/**
 * Runs `use` against the run's E2E database through the services, as the manual actor, and
 * closes the connection afterwards. Specs seed and clean up their data with it.
 */
export async function withServices<T>(use: (ctx: ServiceContext) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl(process.env.E2E_DATABASE_NAME!));
  try {
    return await use({ db, actor: { type: 'manual', id: null } });
  } finally {
    await db.end();
  }
}
