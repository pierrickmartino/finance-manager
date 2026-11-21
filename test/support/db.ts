import { randomBytes } from 'node:crypto';
import type pg from 'pg';
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

/** Each pool's clients whose connections are still open. */
const openClients = new WeakMap<Db, Set<pg.ClientBase>>();

function trackConnections(db: Db): void {
  const clients = new Set<pg.ClientBase>();
  openClients.set(db, clients);
  db.on('connect', (client) => {
    clients.add(client);
    client.once('end', () => clients.delete(client));
  });
}

/**
 * Ends the pool and waits until every connection has really closed. `pool.end()` alone resolves
 * once it has asked idle clients to close, while their sockets are still open; dropping the
 * database WITH (FORCE) then terminates them (57P01) with no listener left, an unhandled error.
 */
async function endPool(db: Db): Promise<void> {
  const clients = [...(openClients.get(db) ?? [])];
  const closed = clients.map((client) => new Promise((resolve) => client.once('end', resolve)));
  await db.end();
  await Promise.all(closed);
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
    trackConnections(db);
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
    if (db) await endPool(db);
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
