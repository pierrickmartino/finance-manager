/**
 * Applies (or rolls back) SQL migrations against DATABASE_URL.
 *   pnpm db:migrate          apply all pending migrations (also run by scripts/docker-start.sh on every deploy)
 *   pnpm db:migrate:down     roll back the most recent migration
 */
import { migrate } from '../src/server/db/migrate';

async function main(): Promise<void> {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  const ran = await migrate(url, { direction });
  console.log(ran.length ? `Migrated ${direction}: ${ran.join(', ')}` : 'No migrations to run');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
