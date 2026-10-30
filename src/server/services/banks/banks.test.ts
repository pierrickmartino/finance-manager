import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createBank, listBanks } from '.';

const t = setupTestDatabase();

describe('Banks', () => {
  it('creates a Bank that is then listed', async () => {
    const created = await createBank(t.ctx, { name: 'BCGE' });

    expect(created).toEqual({ id: expect.any(String), name: 'BCGE' });
    expect(await listBanks(t.ctx)).toEqual([created]);
  });

  it('trims the name and rejects a blank one', async () => {
    expect(await createBank(t.ctx, { name: '  UBS ' })).toMatchObject({ name: 'UBS' });

    await expect(createBank(t.ctx, { name: '   ' })).rejects.toMatchObject({
      code: 'validation',
      message: 'Bank name is required',
    });
    expect(await listBanks(t.ctx)).toHaveLength(1);
  });

  it('rejects a second Bank with the same name, ignoring case', async () => {
    await createBank(t.ctx, { name: 'Crédit Agricole' });

    await expect(createBank(t.ctx, { name: 'crédit agricole' })).rejects.toMatchObject({
      code: 'conflict',
      message: 'A Bank named "crédit agricole" already exists',
    });
    expect(await listBanks(t.ctx)).toHaveLength(1);
  });

  it('lists Banks alphabetically', async () => {
    for (const name of ['UBS', 'Cler', 'Crédit Agricole', 'BCGE']) {
      await createBank(t.ctx, { name });
    }

    const names = (await listBanks(t.ctx)).map((bank) => bank.name);

    expect(names).toEqual(['BCGE', 'Cler', 'Crédit Agricole', 'UBS']);
  });
});
