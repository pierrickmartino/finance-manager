import path from 'node:path';
import { runner } from 'node-pg-migrate';

/** All migrations are plain SQL files in `<repo>/migrations`, named `<UTC timestamp>_<slug>.sql`. */
export const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');
export const MIGRATIONS_TABLE = 'pgmigrations';

export interface MigrateOptions {
  direction?: 'up' | 'down';
  /** Number of migrations to run; defaults to all (up) or one (down). */
  count?: number;
  quiet?: boolean;
}

export async function migrate(
  databaseUrl: string,
  options: MigrateOptions = {},
): Promise<string[]> {
  const direction = options.direction ?? 'up';
  const silent = (): void => undefined;
  const ran = await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    migrationsTable: MIGRATIONS_TABLE,
    direction,
    count: options.count ?? (direction === 'up' ? Infinity : 1),
    // Parallel branches add migrations with interleaved timestamps; apply whatever is missing.
    checkOrder: false,
    singleTransaction: true,
    logger: options.quiet
      ? { debug: silent, info: silent, warn: console.warn, error: console.error }
      : console,
  });
  return ran.map((migration) => migration.name);
}
