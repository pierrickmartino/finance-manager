import type { ServiceContext } from '../context';

/** Throws when the database is unreachable. */
export async function checkHealth(ctx: ServiceContext): Promise<void> {
  await ctx.db.query('SELECT 1');
}
