import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, databaseUrl, dropDatabase } from '@test/support/postgres';
import { migrate } from './migrate';

describe('migrations', () => {
  const name = `${inject('testDatabase').prefix}_migrations`;
  const url = databaseUrl(name);

  beforeAll(() => createDatabase(name));
  afterAll(() => dropDatabase(name));

  it('all apply, roll back, and apply again on an empty database', async () => {
    const applied = await migrate(url, { quiet: true });
    expect(applied.length).toBeGreaterThan(0);

    const rolledBack = await migrate(url, { direction: 'down', count: Infinity, quiet: true });
    expect(rolledBack).toEqual([...applied].reverse());

    expect(await migrate(url, { quiet: true })).toEqual(applied);
    expect(await migrate(url, { quiet: true })).toEqual([]);
  });
});
