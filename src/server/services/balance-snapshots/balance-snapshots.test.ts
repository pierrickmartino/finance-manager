import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import {
  createAccount,
  getAccount,
  listAccounts,
  type Account,
  type AccountInput,
} from '../accounts';
import { createBank } from '../banks';
import { listHistory } from '../history';
import { createManualTransaction } from '../transactions/manual';
import { ConflictError } from '../errors';
import {
  deleteBalanceSnapshot,
  listBalanceSnapshots,
  listSnapshotMismatches,
  recordBalanceSnapshot,
  updateBalanceSnapshot,
} from '.';

const t = setupTestDatabase();

async function clerAccount(overrides: Partial<AccountInput> = {}): Promise<Account> {
  const bank = await createBank(t.ctx, { name: 'Cler' });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Cler current',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: null,
    openingBalanceMinor: 100000,
    openingDate: '2021-01-01',
    ...overrides,
  });
}

async function spend(account: Account, bookingDate: string, amountMinor: number): Promise<void> {
  await createManualTransaction(t.ctx, {
    accountId: account.id,
    bookingDate,
    amountMinor,
    description: 'Groceries',
  });
}

describe('record a Balance snapshot', () => {
  it('lists it with the computed balance at its date and records its creation', async () => {
    const account = await clerAccount();
    await spend(account, '2025-03-14', -4590);
    await spend(account, '2025-04-02', -1000);

    const snapshot = await recordBalanceSnapshot(t.ctx, {
      accountId: account.id,
      date: '2025-03-31',
      balanceMinor: 95410,
    });

    expect(await listBalanceSnapshots(t.ctx, account.id)).toEqual([
      expect.objectContaining({
        id: snapshot.id,
        date: '2025-03-31',
        balanceMinor: 95410,
        computedMinor: 95410,
        differenceMinor: 0,
        isMismatch: false,
      }),
    ]);
    expect(await listHistory(t.ctx, { entityType: 'balance_snapshot' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: snapshot.id, field: 'balanceMinor', after: 95410 }),
      ]),
    );
  });
});

describe('edit and delete Balance snapshots', () => {
  it('refuses a second snapshot on the same day', async () => {
    const account = await clerAccount();
    await recordBalanceSnapshot(t.ctx, {
      accountId: account.id,
      date: '2025-03-31',
      balanceMinor: 1,
    });

    await expect(
      recordBalanceSnapshot(t.ctx, { accountId: account.id, date: '2025-03-31', balanceMinor: 2 }),
    ).rejects.toThrow(ConflictError);
  });

  it('records edits and deletion in History', async () => {
    const account = await clerAccount();
    const created = await recordBalanceSnapshot(t.ctx, {
      accountId: account.id,
      date: '2025-03-31',
      balanceMinor: 95410,
    });

    await updateBalanceSnapshot(t.ctx, created.id, { date: '2025-03-31', balanceMinor: 95400 });
    await deleteBalanceSnapshot(t.ctx, created.id);

    expect(await listBalanceSnapshots(t.ctx, account.id)).toEqual([]);
    const history = await listHistory(t.ctx, {
      entityId: created.id,
      entityType: 'balance_snapshot',
    });
    expect(
      history.filter((entry) => entry.field === 'balanceMinor').map((e) => [e.before, e.after]),
    ).toEqual([
      [95400, null],
      [95410, 95400],
      [null, 95410],
    ]);
  });
});

describe('a snapshot-only loan Account', () => {
  it('shows its balance from the latest snapshot and never reports a mismatch', async () => {
    const loan = await clerAccount({ name: 'Cler mortgage', kind: 'loan', openingBalanceMinor: 0 });
    await recordBalanceSnapshot(t.ctx, {
      accountId: loan.id,
      date: '2025-12-31',
      balanceMinor: -48000000,
    });
    await recordBalanceSnapshot(t.ctx, {
      accountId: loan.id,
      date: '2024-12-31',
      balanceMinor: -50000000,
    });

    expect(await getAccount(t.ctx, loan.id)).toMatchObject({
      balanceMinor: -48000000,
      balanceSnapshotDate: '2025-12-31',
    });
    expect((await listAccounts(t.ctx))[0]).toMatchObject({ balanceMinor: -48000000 });
    expect(await listSnapshotMismatches(t.ctx)).toEqual([]);
  });

  it('computes its balance from Transactions as soon as it has one', async () => {
    const account = await clerAccount();
    await recordBalanceSnapshot(t.ctx, {
      accountId: account.id,
      date: '2025-12-31',
      balanceMinor: 1,
    });
    await spend(account, '2025-03-14', -4590);

    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      balanceMinor: 100000 - 4590,
      balanceSnapshotDate: null,
    });
  });
});

describe('Balance snapshot mismatch', () => {
  it('is detected when the computed balance differs, and cleared once the missing Transaction is entered', async () => {
    const account = await clerAccount();
    await spend(account, '2025-03-14', -4590);
    await recordBalanceSnapshot(t.ctx, {
      accountId: account.id,
      date: '2025-03-31',
      balanceMinor: 93410,
    });

    expect(await listSnapshotMismatches(t.ctx)).toEqual([
      expect.objectContaining({
        accountId: account.id,
        date: '2025-03-31',
        balanceMinor: 93410,
        computedMinor: 95410,
        differenceMinor: 2000,
        isMismatch: true,
      }),
    ]);

    await spend(account, '2025-03-20', -2000);

    expect(await listSnapshotMismatches(t.ctx)).toEqual([]);
    expect((await listBalanceSnapshots(t.ctx, account.id))[0]).toMatchObject({
      isMismatch: false,
    });
  });
});
