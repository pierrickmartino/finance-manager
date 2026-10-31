import type pg from 'pg';
import type { Db } from './client';

/** Runs `fn` inside one database transaction: commit on success, rollback on any error. */
export async function withTransaction<T>(
  db: Db,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
