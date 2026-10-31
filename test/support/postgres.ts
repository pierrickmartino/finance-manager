import { randomBytes } from 'node:crypto';
import pg from 'pg';

/**
 * Helpers shared by the service-test and E2E harnesses. Parallel agents and CI jobs share
 * one Postgres server, so every run creates uniquely named databases and drops only those.
 */
export const DEFAULT_ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

export function adminUrl(): string {
  return process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_ADMIN_URL;
}

/** e.g. `fm_test_m2x1k9_a3f9c1`: lowercase, safe as an unquoted identifier. */
export function uniqueDatabaseName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}

export function databaseUrl(name: string): string {
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

function assertSafeName(name: string): void {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

async function withAdmin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: adminUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function createDatabase(name: string, template?: string): Promise<void> {
  assertSafeName(name);
  if (template) assertSafeName(template);
  await withAdmin((client) =>
    client.query(`CREATE DATABASE ${name}${template ? ` TEMPLATE ${template}` : ''}`),
  );
}

export async function dropDatabase(name: string): Promise<void> {
  assertSafeName(name);
  await withAdmin((client) => client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
}

/** Drops every database whose name starts with `prefix`: only ever a prefix this run generated. */
export async function dropDatabasesWithPrefix(prefix: string): Promise<void> {
  assertSafeName(prefix);
  const names = await withAdmin(async (client) => {
    const result = await client.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE starts_with(datname, $1)',
      [prefix],
    );
    return result.rows.map((row) => row.datname);
  });
  for (const name of names) {
    await dropDatabase(name);
  }
}
