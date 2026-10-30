import { dropDatabase } from '../../test/support/postgres';

/** Drops the database this run's web server created. */
export default async function globalTeardown(): Promise<void> {
  const name = process.env.E2E_DATABASE_NAME;
  if (name) {
    await dropDatabase(name);
  }
}
