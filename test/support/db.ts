import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createDb, type Db } from '@/server/db/client';
import { MIGRATIONS_TABLE } from '@/server/db/migrate';
import type { Actor, ServiceContext } from '@/server/services/context';
import { createDatabase, databaseUrl, dropDatabase } from './postgres';

export interface TestDatabase {
  /** A service context on this file's database, acting as the manual user. */
  readonly ctx: ServiceContext;
  /** The same database with a different actor (e.g. a Rule or an Import). */
  withActor(actor: Actor): ServiceContext;
}

/**
 * Call once at the top of a service test file. The file gets its own database, cloned from
 * the run's migrated template, and every table is truncated before each test.
 */
export function setupTestDatabase(): TestDatabase {
  const { template, prefix } = inject('testDatabase');
  const name = `${prefix}_${randomBytes(4).toString('hex')}`;
  let db: Db | undefined;
  let tables: string[] = [];

  const requireDb = (): Db => {
    if (!db) throw new Error('setupTestDatabase(): database not ready (use it inside a test)');
    return db;
  };

  beforeAll(async () => {
    await createDatabase(name, template);
    db = createDb(databaseUrl(name));
    const result = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> $1`,
      [MIGRATIONS_TABLE],
    );
    tables = result.rows.map((row) => `"${row.tablename}"`);
  });

  beforeEach(async () => {
    if (tables.length) {
      await requireDb().query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    }
  });

  afterAll(async () => {
    await db?.end();
    await dropDatabase(name);
  });

  const withActor = (actor: Actor): ServiceContext => ({ db: requireDb(), actor });
  return {
    get ctx() {
      return withActor({ type: 'manual', id: null });
    },
    withActor,
  };
}
