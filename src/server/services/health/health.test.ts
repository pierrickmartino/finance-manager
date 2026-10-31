import { expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { checkHealth } from '.';

const t = setupTestDatabase();

it('passes when the database is reachable', async () => {
  await expect(checkHealth(t.ctx)).resolves.toBeUndefined();
});
