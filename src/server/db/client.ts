import pg from 'pg';

/**
 * Type parsers, set once for the whole process:
 * - BIGINT (int8) becomes a JS number. Amounts are integer minor units (ADR-0002);
 *   anything beyond Number.MAX_SAFE_INTEGER is a bug, so we fail loudly.
 * - DATE stays an ISO `YYYY-MM-DD` string, so no time zone ever shifts a booking date.
 */
const INT8_OID = 20;
const DATE_OID = 1082;

pg.types.setTypeParser(INT8_OID, (value: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`BIGINT value ${value} exceeds the safe integer range`);
  }
  return parsed;
});
pg.types.setTypeParser(DATE_OID, (value: string): string => value);

/** A connection pool. Service operations receive it through the ServiceContext. */
export type Db = pg.Pool;

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = pg.Pool | pg.PoolClient;

export function createDb(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

const globalForDb = globalThis as unknown as { appDb?: Db };

/** The app's shared pool, built from DATABASE_URL. Reused across dev hot reloads. */
export function getDb(): Db {
  if (!globalForDb.appDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    globalForDb.appDb = createDb(url);
  }
  return globalForDb.appDb;
}
