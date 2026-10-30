import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createBank, type Bank } from '../banks';
import { listHistory } from '../history';
import { archiveAccount, createAccount, getAccount, listAccounts, updateAccount } from '.';

const t = setupTestDatabase();

async function bank(name = 'UBS'): Promise<Bank> {
  return createBank(t.ctx, { name });
}

describe('Accounts', () => {
  it('creates an Account, listed with its opening balance in its own Currency', async () => {
    const ubs = await bank();

    const account = await createAccount(t.ctx, {
      bankId: ubs.id,
      name: 'UBS current',
      currency: 'CHF',
      iban: 'CH69 0023 5235 1234 5601 0',
      kind: 'current',
      importFormat: 'ubs_csv',
      openingBalanceMinor: 123456,
      openingDate: '2021-01-01',
    });

    expect(account).toEqual({
      id: expect.any(String),
      bankId: ubs.id,
      bankName: 'UBS',
      name: 'UBS current',
      currency: 'CHF',
      iban: 'CH6900235235123456010',
      kind: 'current',
      importFormat: 'ubs_csv',
      openingBalanceMinor: 123456,
      openingDate: '2021-01-01',
      archivedAt: null,
      balanceMinor: 123456,
      balanceSnapshotDate: null,
    });
    expect(await listAccounts(t.ctx)).toEqual([account]);
    expect(await getAccount(t.ctx, account.id)).toEqual(account);
  });

  it('records one History entry per field of a new Account, all in one Batch', async () => {
    const ubs = await bank();
    const before = await listHistory(t.ctx);

    const account = await createAccount(t.ctx, {
      bankId: ubs.id,
      name: 'Cler current',
      currency: 'CHF',
      kind: 'current',
      openingBalanceMinor: 0,
    });

    const entries = (await listHistory(t.ctx)).slice(0, -before.length);
    expect(new Set(entries.map((entry) => entry.batchId)).size).toBe(1);
    expect(entries.every((entry) => entry.entityType === 'account')).toBe(true);
    expect(entries.every((entry) => entry.entityId === account.id)).toBe(true);
    expect(
      Object.fromEntries(entries.map((entry) => [entry.field, [entry.before, entry.after]])),
    ).toEqual({
      bankId: [null, ubs.id],
      name: [null, 'Cler current'],
      currency: [null, 'CHF'],
      kind: [null, 'current'],
      openingBalanceMinor: [null, 0],
    });
  });

  it('allows an Account without IBAN, Import format or opening date', async () => {
    const ubs = await bank();

    const account = await createAccount(t.ctx, {
      bankId: ubs.id,
      name: 'Mortgage',
      currency: 'chf',
      iban: '  ',
      kind: 'loan',
      importFormat: '',
      openingBalanceMinor: -50000000,
      openingDate: '',
    });

    expect(account).toMatchObject({
      currency: 'CHF',
      iban: null,
      importFormat: null,
      openingDate: null,
      balanceMinor: -50000000,
    });
  });

  it.each([
    ['an unknown Currency', { currency: 'XYZ' }, 'Unknown Currency'],
    ['an IBAN with a wrong check digit', { iban: 'CH6900235235123456011' }, 'IBAN is not valid'],
    ['an unknown kind', { kind: 'brokerage' }, 'Unknown Account kind'],
    ['an unknown Import format', { importFormat: 'qif' }, 'Unknown Import format'],
    ['a fractional amount', { openingBalanceMinor: 12.5 }, 'whole number of minor units'],
    ['a blank name', { name: ' ' }, 'Account name is required'],
    ['an impossible date', { openingDate: '2025-02-30' }, 'Opening date'],
  ])('rejects %s and records nothing', async (_case, override, message) => {
    const ubs = await bank();
    const historyBefore = await listHistory(t.ctx);

    await expect(
      createAccount(t.ctx, {
        bankId: ubs.id,
        name: 'UBS current',
        currency: 'CHF',
        kind: 'current',
        openingBalanceMinor: 0,
        ...override,
      } as Parameters<typeof createAccount>[1]),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringContaining(message) });

    expect(await listAccounts(t.ctx)).toEqual([]);
    expect(await listHistory(t.ctx)).toEqual(historyBefore);
  });

  it('rejects an unknown Bank', async () => {
    await expect(
      createAccount(t.ctx, {
        bankId: '00000000-0000-4000-8000-000000000000',
        name: 'X',
        currency: 'CHF',
        kind: 'current',
        openingBalanceMinor: 0,
      }),
    ).rejects.toMatchObject({ code: 'not_found', message: 'Bank not found' });
  });

  it('rejects a second Account with the same IBAN, and records nothing for it', async () => {
    const ubs = await bank();
    const input = {
      bankId: ubs.id,
      name: 'UBS current',
      currency: 'CHF',
      iban: 'CH6900235235123456010',
      kind: 'current',
      openingBalanceMinor: 0,
    } as const;
    await createAccount(t.ctx, input);
    const historyBefore = await listHistory(t.ctx);

    await expect(createAccount(t.ctx, { ...input, name: 'Other' })).rejects.toMatchObject({
      code: 'conflict',
      message: 'An Account with IBAN CH6900235235123456010 already exists',
    });
    expect(await listHistory(t.ctx)).toEqual(historyBefore);
  });

  it('rejects a second Account with the same name at the same Bank', async () => {
    const ubs = await bank();
    const input = {
      bankId: ubs.id,
      name: 'Savings',
      currency: 'CHF',
      kind: 'savings',
      openingBalanceMinor: 0,
    } as const;
    await createAccount(t.ctx, input);

    await expect(createAccount(t.ctx, { ...input, name: 'savings' })).rejects.toMatchObject({
      code: 'conflict',
      message: 'UBS already has an Account named "savings"',
    });
    const other = await bank('BCGE');
    await expect(createAccount(t.ctx, { ...input, bankId: other.id })).resolves.toBeDefined();
  });

  describe('editing', () => {
    async function account() {
      const ubs = await bank();
      return createAccount(t.ctx, {
        bankId: ubs.id,
        name: 'UBS current',
        currency: 'CHF',
        iban: 'CH6900235235123456010',
        kind: 'current',
        importFormat: 'ubs_csv',
        openingBalanceMinor: 1000,
        openingDate: '2021-01-01',
      });
    }

    it('saves the new values and records only the changed fields, in one Batch', async () => {
      const original = await account();
      const historyBefore = await listHistory(t.ctx);

      const updated = await updateAccount(t.ctx, original.id, {
        bankId: original.bankId,
        name: 'UBS joint',
        currency: 'CHF',
        iban: original.iban,
        kind: 'current',
        importFormat: 'ubs_csv',
        openingBalanceMinor: 2500,
        openingDate: '2021-01-01',
      });

      expect(updated).toEqual({
        ...original,
        name: 'UBS joint',
        openingBalanceMinor: 2500,
        balanceMinor: 2500,
      });
      const entries = (await listHistory(t.ctx)).slice(0, -historyBefore.length);
      expect(entries.map(({ field, before, after }) => ({ field, before, after }))).toEqual([
        { field: 'openingBalanceMinor', before: 1000, after: 2500 },
        { field: 'name', before: 'UBS current', after: 'UBS joint' },
      ]);
      expect(entries[0]!.batchId).toBe(entries[1]!.batchId);
      expect(entries[0]).toMatchObject({ entityType: 'account', entityId: original.id });
    });

    it('can change the Import format while the Account has no Transactions', async () => {
      const original = await account();

      const updated = await updateAccount(t.ctx, original.id, {
        ...original,
        importFormat: null,
      });

      expect(updated.importFormat).toBeNull();
    });

    it('rejects an unknown Account', async () => {
      const original = await account();

      await expect(
        updateAccount(t.ctx, '00000000-0000-4000-8000-000000000000', original),
      ).rejects.toMatchObject({ code: 'not_found', message: 'Account not found' });
    });

    it('rejects invalid values and records nothing', async () => {
      const original = await account();
      const historyBefore = await listHistory(t.ctx);

      await expect(
        updateAccount(t.ctx, original.id, { ...original, name: 'New', iban: 'CH00' }),
      ).rejects.toMatchObject({ code: 'validation' });

      expect(await getAccount(t.ctx, original.id)).toEqual(original);
      expect(await listHistory(t.ctx)).toEqual(historyBefore);
    });
  });

  describe('archiving', () => {
    it('keeps the Account, lists it as archived after the active ones, and records it', async () => {
      const ubs = await bank();
      const base = {
        bankId: ubs.id,
        currency: 'CHF',
        kind: 'current',
        openingBalanceMinor: 0,
      } as const;
      const old = await createAccount(t.ctx, { ...base, name: 'A old' });
      const current = await createAccount(t.ctx, { ...base, name: 'B current' });

      const archived = await archiveAccount(t.ctx, old.id);

      expect(archived.archivedAt).toBeInstanceOf(Date);
      expect(
        (await listAccounts(t.ctx)).map((account) => [account.name, account.archivedAt]),
      ).toEqual([
        [current.name, null],
        [old.name, archived.archivedAt],
      ]);
      expect(await listHistory(t.ctx, { entityId: old.id, limit: 1 })).toMatchObject([
        { field: 'archivedAt', before: null, after: archived.archivedAt!.toISOString() },
      ]);
    });

    it('rejects archiving an Account twice', async () => {
      const ubs = await bank();
      const account = await createAccount(t.ctx, {
        bankId: ubs.id,
        name: 'Old',
        currency: 'EUR',
        kind: 'savings',
        openingBalanceMinor: 0,
      });
      await archiveAccount(t.ctx, account.id);

      await expect(archiveAccount(t.ctx, account.id)).rejects.toMatchObject({
        code: 'conflict',
        message: 'This Account is already archived',
      });
    });

    it('rejects an unknown Account', async () => {
      await expect(
        archiveAccount(t.ctx, '00000000-0000-4000-8000-000000000000'),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
  });
});
