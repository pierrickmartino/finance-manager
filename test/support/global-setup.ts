import type { TestProject } from 'vitest/node';
import { migrate } from '../../src/server/db/migrate';
import {
  createDatabase,
  databaseUrl,
  dropDatabasesWithPrefix,
  uniqueDatabaseName,
} from './postgres';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Name of the migrated template database for this run, and the prefix its clones share. */
    testDatabase: { template: string; prefix: string };
  }
}

/**
 * Once per `vitest run`: create a uniquely named template database and apply all migrations.
 * Each test file then clones it (see db.ts). Teardown drops every database of this run.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const prefix = uniqueDatabaseName('fm_test');
  const template = `${prefix}_tpl`;
  await createDatabase(template);
  try {
    await migrate(databaseUrl(template), { quiet: true });
  } catch (error: unknown) {
    await dropDatabasesWithPrefix(prefix);
    throw error;
  }
  project.provide('testDatabase', { template, prefix });
  return () => dropDatabasesWithPrefix(prefix);
}
