import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createBank } from '../banks';
import { mutate } from '../context';
import { updateDisplaySettings } from '../settings';
import { getBatchSummaries, listHistory } from '.';

const t = setupTestDatabase();

describe('History', () => {
  it('records the creation of a Bank, by the acting party', async () => {
    const bank = await createBank(t.ctx, { name: 'BCGE' });

    expect(await listHistory(t.ctx)).toEqual([
      {
        id: expect.any(String),
        batchId: expect.any(String),
        at: expect.any(Date),
        actorType: 'manual',
        actorId: null,
        entityType: 'bank',
        entityId: bank.id,
        field: 'name',
        before: null,
        after: 'BCGE',
      },
    ]);
  });

  it('records only the fields an update changed, from the values in effect before', async () => {
    await updateDisplaySettings(t.ctx, { numberFormat: 'dot', dateFormat: 'dd.mm.yyyy' });

    expect(await listHistory(t.ctx)).toMatchObject([
      {
        entityType: 'settings',
        entityId: 'display',
        field: 'numberFormat',
        before: 'apostrophe',
        after: 'dot',
      },
    ]);
  });

  it('groups every entry of one mutation in one Batch, and separate mutations in separate Batches', async () => {
    const batchId = await mutate(t.ctx, async ({ history }) => {
      await history.record('bank', 'b1', null, { name: 'UBS' });
      await history.record('bank', 'b2', { name: 'Cler' }, { name: 'Banque Cler' });
      return history.batchId;
    });
    await mutate(t.ctx, ({ history }) => history.record('bank', 'b3', null, { name: 'BCGE' }));

    const entries = await listHistory(t.ctx);

    expect(entries.map((entry) => [entry.entityId, entry.batchId === batchId])).toEqual([
      ['b3', false],
      ['b2', true],
      ['b1', true],
    ]);
    expect(entries[1]).toMatchObject({ field: 'name', before: 'Cler', after: 'Banque Cler' });
  });

  it('records a deletion as the fields going from their values to nothing', async () => {
    await mutate(t.ctx, ({ history }) =>
      history.record('bank', 'b1', { name: 'UBS', note: null }, null),
    );

    expect(await listHistory(t.ctx)).toMatchObject([{ field: 'name', before: 'UBS', after: null }]);
  });

  it('keeps no entries of a mutation that fails', async () => {
    const failing = mutate(t.ctx, async ({ history }) => {
      await history.record('bank', 'b1', null, { name: 'UBS' });
      throw new Error('boom');
    });

    await expect(failing).rejects.toThrow('boom');
    expect(await listHistory(t.ctx)).toEqual([]);
  });

  it('records the actor of the context, such as a Rule', async () => {
    const ruleCtx = t.withActor({ type: 'rule', id: 'rule-42' });

    await mutate(ruleCtx, ({ history }) => history.record('bank', 'b1', null, { name: 'UBS' }));

    expect(await listHistory(t.ctx)).toMatchObject([{ actorType: 'rule', actorId: 'rule-42' }]);
  });

  it('cannot be changed or deleted once written', async () => {
    await createBank(t.ctx, { name: 'BCGE' });

    await expect(t.ctx.db.query('UPDATE history_entry SET after = \'"x"\'')).rejects.toThrow(
      /append-only/,
    );
    await expect(t.ctx.db.query('DELETE FROM history_entry')).rejects.toThrow(/append-only/);
    expect(await listHistory(t.ctx)).toHaveLength(1);
  });

  describe('filters', () => {
    const zurichToday = (offsetDays = 0): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(
        new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000),
      );

    async function seed(): Promise<{ bankBatch: string; ruleBatch: string }> {
      const bankBatch = await mutate(t.ctx, async ({ history }) => {
        await history.record('bank', 'b1', null, { name: 'UBS' });
        return history.batchId;
      });
      const ruleBatch = await mutate(
        t.withActor({ type: 'rule', id: 'r1' }),
        async ({ history }) => {
          await history.record('account', 'a1', { name: 'Old' }, { name: 'New' });
          await history.record('account', 'a2', { name: 'Old' }, { name: 'New' });
          return history.batchId;
        },
      );
      return { bankBatch, ruleBatch };
    }

    const ids = (entries: Array<{ entityId: string }>): string[] =>
      entries.map((entry) => entry.entityId);

    it('by entity type, and by one entity', async () => {
      await seed();

      expect(ids(await listHistory(t.ctx, { entityType: 'account' }))).toEqual(['a2', 'a1']);
      expect(ids(await listHistory(t.ctx, { entityType: 'account', entityId: 'a1' }))).toEqual([
        'a1',
      ]);
    });

    it('by actor', async () => {
      await seed();

      expect(ids(await listHistory(t.ctx, { actorType: 'manual' }))).toEqual(['b1']);
      expect(ids(await listHistory(t.ctx, { actorType: 'rule' }))).toEqual(['a2', 'a1']);
    });

    it('by Batch', async () => {
      const { bankBatch } = await seed();

      expect(ids(await listHistory(t.ctx, { batchId: bankBatch }))).toEqual(['b1']);
    });

    it('by date, inclusive, in Swiss local time', async () => {
      await seed();

      expect(await listHistory(t.ctx, { from: zurichToday(), to: zurichToday() })).toHaveLength(3);
      expect(await listHistory(t.ctx, { from: zurichToday(1) })).toEqual([]);
      expect(await listHistory(t.ctx, { to: zurichToday(-1) })).toEqual([]);
    });

    it('combine', async () => {
      const { ruleBatch } = await seed();

      expect(
        ids(await listHistory(t.ctx, { batchId: ruleBatch, entityId: 'a2', actorType: 'rule' })),
      ).toEqual(['a2']);
    });

    it('ignore blank values, as an empty filter form sends them', async () => {
      await seed();

      expect(
        await listHistory(t.ctx, { from: '', to: '', entityType: '', actorType: '', batchId: '' }),
      ).toHaveLength(3);
    });

    it('return at most the requested number of the newest entries', async () => {
      await seed();

      expect(ids(await listHistory(t.ctx, { limit: 2 }))).toEqual(['a2', 'a1']);
    });

    it('reject a malformed date, Batch id or actor', async () => {
      await expect(listHistory(t.ctx, { from: '2025-13-40' })).rejects.toMatchObject({
        code: 'validation',
      });
      await expect(listHistory(t.ctx, { batchId: 'nope' })).rejects.toMatchObject({
        code: 'validation',
      });
      await expect(listHistory(t.ctx, { actorType: 'robot' })).rejects.toMatchObject({
        code: 'validation',
      });
    });
  });

  it('records nothing when an update changes nothing', async () => {
    await updateDisplaySettings(t.ctx, { numberFormat: 'apostrophe', dateFormat: 'dd.mm.yyyy' });

    expect(await listHistory(t.ctx)).toEqual([]);
  });

  it('keeps one readable summary per Batch, rolled back with it', async () => {
    const batchId = await mutate(t.ctx, async ({ history }) => {
      await history.record('bank', 'b1', null, { name: 'UBS' });
      await history.summarize('Created UBS');
      return history.batchId;
    });
    await expect(
      mutate(t.ctx, async ({ history }) => {
        await history.summarize('Never happened');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await getBatchSummaries(t.ctx, [batchId, '00000000-0000-4000-8000-000000000000'])).toEqual({
      [batchId]: 'Created UBS',
    });
    expect(await getBatchSummaries(t.ctx, [])).toEqual({});
  });
});
