/**
 * Creates an empty SQL migration: pnpm db:new-migration create_account
 * The UTC timestamp prefix (to the second) keeps names unique across parallel branches.
 */
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { MIGRATIONS_DIR } from '../src/server/db/migrate';

const slug = process.argv[2];
if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
  console.error('Usage: pnpm db:new-migration <snake_case_slug>');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..*$/, '');
const file = path.join(MIGRATIONS_DIR, `${stamp}_${slug}.sql`);
if (existsSync(file)) {
  console.error(`${file} already exists`);
  process.exit(1);
}
writeFileSync(file, '-- Up Migration\n\n\n-- Down Migration\n\n');
console.log(`Created ${path.relative(process.cwd(), file)}`);
