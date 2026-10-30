/**
 * Playwright's web server: creates the run's database, migrates it, builds the app and
 * serves the production build on it.
 *
 * Why not `next dev`: its HMR client does one full page reload right after a fresh browser
 * connects, which races with the first interaction. E2E_SERVER=dev opts back in for debugging.
 */
import { spawn, spawnSync } from 'node:child_process';
import { migrate } from '../../src/server/db/migrate';
import { createDatabase, databaseUrl, dropDatabase } from '../../test/support/postgres';

async function main(): Promise<void> {
  const name = process.env.E2E_DATABASE_NAME;
  const port = process.env.E2E_PORT;
  if (!name || !port) {
    throw new Error('E2E_DATABASE_NAME and E2E_PORT must be set (see playwright.config.ts)');
  }
  const url = databaseUrl(name);
  const env = { ...process.env, DATABASE_URL: url };
  const isDev = process.env.E2E_SERVER === 'dev';

  if (!isDev) {
    const build = spawnSync('pnpm', ['exec', 'next', 'build'], { stdio: 'inherit', env });
    if (build.status !== 0) throw new Error('next build failed');
  }

  await createDatabase(name);
  await migrate(url, { quiet: true });

  const child = spawn('pnpm', ['exec', 'next', isDev ? 'dev' : 'start', '-p', port], {
    stdio: 'inherit',
    env,
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  // Playwright skips globalTeardown when the server never became ready, so clean up here too.
  child.on('exit', (code) => {
    dropDatabase(name)
      .catch((error: unknown) => console.error('Could not drop E2E database', error))
      .finally(() => process.exit(code ?? 0));
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
