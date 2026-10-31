import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { listHistory } from '../history';
import { deleteImportedTransaction } from '../imports';
import { createRule } from '../rules';
import {
  editClassification,
  getClassification,
  getTransaction,
  listTransactions,
} from '../transactions';
import { bulkEditClassification } from '../transactions/bulk-edit';
import {
  createManualTransaction,
  deleteManualTransaction,
  updateManualTransaction,
} from '../transactions/manual';
import { getClassificationProgress, listUnclassifiedGroups } from '../transactions/unclassified';
import { getTransferCounterpart, linkTransfer, listLinkOptions, unlinkTransfer } from '.';

const t = setupTestDatabase();

async function account(name: string, currency = 'CHF'): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `Bank ${name}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name,
    currency,
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

async function seedOne(on: Account, row: Partial<SeedTransaction> = {}): Promise<string> {
  const [id] = await seedTransactions(t.ctx.db, on, [
    { bookingDate: '2025-10-10', amountMinor: -200000, rawDescription: 'ORDRE E-BANKING', ...row },
  ]);
  return id!;
}

/** Two opposite Transactions on two Accounts, ready to link. */
async function pair() {
  const ubs = await account('UBS');
  const bcge = await account('BCGE');
  const out = await seedOne(bcge, { amountMinor: -200000 });
  const into = await seedOne(ubs, { amountMinor: 200000 });
  return { ubs, bcge, out, into };
}

describe('link two Transactions as a Transfer', () => {
  it('links both sides to one Transfer and records it in History', async () => {
    const { out, into } = await pair();

    const transfer = await linkTransfer(t.ctx, { transactionIds: [out, into] });

    expect((await getTransaction(t.ctx, out)).transferId).toBe(transfer.id);
    expect((await getTransaction(t.ctx, into)).transferId).toBe(transfer.id);
    expect(transfer.transactionIds.sort()).toEqual([out, into].sort());
    const history = await listHistory(t.ctx, { entityType: 'transfer', entityId: transfer.id });
    expect(history).toHaveLength(1);
    expect(await listHistory(t.ctx, { entityId: out })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'transferId',
          before: null,
          after: transfer.id,
          batchId: history[0]!.batchId,
        }),
      ]),
    );
  });

  it('refuses two Transactions on the same Account', async () => {
    const ubs = await account('UBS');
    const out = await seedOne(ubs, { amountMinor: -500 });
    const into = await seedOne(ubs, { amountMinor: 500 });

    await expect(linkTransfer(t.ctx, { transactionIds: [out, into] })).rejects.toThrow(
      /different Accounts/,
    );
  });

  it('refuses two Transactions with the same sign', async () => {
    const ubs = await account('UBS');
    const bcge = await account('BCGE');
    const a = await seedOne(ubs, { amountMinor: -500 });
    const b = await seedOne(bcge, { amountMinor: -500 });

    await expect(linkTransfer(t.ctx, { transactionIds: [a, b] })).rejects.toThrow(/opposite signs/);
    expect((await getTransaction(t.ctx, a)).transferId).toBeNull();
  });

  it('refuses a Transaction already in a Transfer', async () => {
    const { bcge, out, into } = await pair();
    await linkTransfer(t.ctx, { transactionIds: [out, into] });
    const another = await seedOne(bcge, { amountMinor: -200000, bookingDate: '2025-10-11' });

    await expect(linkTransfer(t.ctx, { transactionIds: [another, into] })).rejects.toThrow(
      /already part of a Transfer/,
    );
  });

  it('links any amounts and dates: the user decides', async () => {
    const ubs = await account('UBS');
    const ca = await account('CA', 'EUR');
    const out = await seedOne(ubs, { amountMinor: -100000, bookingDate: '2025-01-01' });
    const into = await seedOne(ca, { amountMinor: 50, bookingDate: '2025-06-30' });

    const transfer = await linkTransfer(t.ctx, { transactionIds: [out, into] });

    expect((await getTransaction(t.ctx, into)).transferId).toBe(transfer.id);
  });
});

describe('the Transfer of a Transaction', () => {
  it('names the other side', async () => {
    const { ubs, out, into } = await pair();
    const alone = await seedOne(ubs, { amountMinor: -1000 });
    await linkTransfer(t.ctx, { transactionIds: [out, into] });

    const other = await getTransferCounterpart(t.ctx, into);

    expect(other).toMatchObject({ id: out, accountName: 'BCGE', amountMinor: -200000 });
    expect(await getTransferCounterpart(t.ctx, alone)).toBeNull();
  });

  it('offers opposite, unlinked Transactions on other Accounts, closest amount first', async () => {
    const { ubs, bcge, out, into } = await pair();
    const far = await seedOne(bcge, { amountMinor: -5000, bookingDate: '2025-10-12' });
    await seedOne(bcge, { amountMinor: 5000 }); // same sign
    await seedOne(ubs, { amountMinor: -200000 }); // same Account
    await seedOne(bcge, { amountMinor: -200000, bookingDate: '2025-12-31' }); // too far away

    const options = await listLinkOptions(t.ctx, into);

    expect(options.map((option) => option.id)).toEqual([out, far]);
  });
});

describe('unlink a Transfer', () => {
  it('unlinks both sides and records it in History', async () => {
    const { out, into } = await pair();
    const transfer = await linkTransfer(t.ctx, { transactionIds: [out, into] });

    await unlinkTransfer(t.ctx, into);

    expect((await getTransaction(t.ctx, out)).transferId).toBeNull();
    expect((await getTransaction(t.ctx, into)).transferId).toBeNull();
    const history = await listHistory(t.ctx, { entityType: 'transfer', entityId: transfer.id });
    expect(history).toHaveLength(2);
    expect(await listHistory(t.ctx, { entityId: out })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'transferId', before: transfer.id, after: null }),
      ]),
    );
  });

  it('refuses a Transaction that is not in a Transfer', async () => {
    const { out } = await pair();

    await expect(unlinkTransfer(t.ctx, out)).rejects.toThrow(/not part of a Transfer/);
  });
});

async function groceries() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
}

describe('Transfers carry no Category', () => {
  it('linking clears the Category on both sides and records it', async () => {
    const { out, into } = await pair();
    const category = await groceries();
    await editClassification(t.ctx, out, { categoryId: category.id });

    await linkTransfer(t.ctx, { transactionIds: [out, into] });

    expect((await getClassification(t.ctx, out)).category).toBeNull();
    expect(await listHistory(t.ctx, { entityId: out })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'category', before: 'Food › Groceries', after: null }),
      ]),
    );
  });

  it("a Transfer can't be given a Category, alone or in a bulk edit", async () => {
    const { out, into } = await pair();
    const category = await groceries();
    await linkTransfer(t.ctx, { transactionIds: [out, into] });

    await expect(editClassification(t.ctx, out, { categoryId: category.id })).rejects.toThrow(
      "A Transfer can't have a Category",
    );
    await expect(
      bulkEditClassification(t.ctx, {
        transactionIds: [out],
        changes: { categoryId: category.id },
      }),
    ).rejects.toThrow("A Transfer can't have a Category");
    expect((await getClassification(t.ctx, out)).category).toBeNull();
  });

  it('a Transfer can still get a Payee, Tags and notes', async () => {
    const { out, into } = await pair();
    await linkTransfer(t.ctx, { transactionIds: [out, into] });

    const result = await editClassification(t.ctx, out, { payeeName: 'Me', notes: 'savings' });

    expect(result).toMatchObject({ payee: { name: 'Me' }, notes: 'savings' });
  });

  it('Rules skip Transfers', async () => {
    const ubs = await account('UBS');
    const bcge = await account('BCGE');
    const category = await groceries();
    await createRule(t.ctx, {
      name: 'Bank orders',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'ordre' }],
      actions: { categoryId: category.id },
    });
    const manual = await createManualTransaction(t.ctx, {
      accountId: ubs.id,
      bookingDate: '2025-10-10',
      amountMinor: 200000,
      description: 'ORDRE from BCGE',
    });
    expect((await getClassification(t.ctx, manual.id)).category?.id).toBe(category.id);
    const other = await seedOne(bcge, { amountMinor: -200000 });
    await linkTransfer(t.ctx, { transactionIds: [manual.id, other] });

    await updateManualTransaction(t.ctx, manual.id, {
      bookingDate: '2025-10-11',
      amountMinor: 200000,
      description: 'ORDRE from BCGE',
    });

    expect((await getClassification(t.ctx, manual.id)).category).toBeNull();
  });
});

describe('Unclassified excludes Transfers', () => {
  it('leaves Transfers out of the Unclassified filter, groups and progress', async () => {
    const { ubs, out, into } = await pair();
    await seedOne(ubs, { amountMinor: -1000, rawDescription: 'COOP' });
    await linkTransfer(t.ctx, { transactionIds: [out, into] });

    const unclassified = await listTransactions(t.ctx, { unclassified: true });
    const groups = await listUnclassifiedGroups(t.ctx, {});
    const progress = await getClassificationProgress(t.ctx);

    expect(unclassified.transactions.map((row) => row.rawDescription)).toEqual(['COOP']);
    expect(groups.groups.map((group) => group.description)).toEqual(['COOP']);
    expect(progress).toMatchObject({ total: 3, unclassified: 1 });
  });
});

describe('Transfer filter on the Transaction list', () => {
  it('lists only Transfers, or everything but Transfers', async () => {
    const { ubs, out, into } = await pair();
    const coop = await seedOne(ubs, { amountMinor: -1000, rawDescription: 'COOP' });
    await linkTransfer(t.ctx, { transactionIds: [out, into] });

    const only = await listTransactions(t.ctx, { transfer: 'only' });
    const excluded = await listTransactions(t.ctx, { transfer: 'exclude' });

    expect(only.transactions.map((row) => row.id).sort()).toEqual([out, into].sort());
    expect(excluded.transactions.map((row) => row.id)).toEqual([coop]);
  });
});

describe('deleting a Transaction unlinks its Transfer', () => {
  it('deleting a Manual transaction leaves the other side unlinked', async () => {
    const ubs = await account('UBS');
    const bcge = await account('BCGE');
    const manual = await createManualTransaction(t.ctx, {
      accountId: ubs.id,
      bookingDate: '2025-10-10',
      amountMinor: 200000,
      description: 'From BCGE',
    });
    const other = await seedOne(bcge, { amountMinor: -200000 });
    const transfer = await linkTransfer(t.ctx, { transactionIds: [manual.id, other] });

    await deleteManualTransaction(t.ctx, manual.id);

    expect((await getTransaction(t.ctx, other)).transferId).toBeNull();
    const history = await listHistory(t.ctx, { entityType: 'transfer', entityId: transfer.id });
    expect(history.map((entry) => entry.after)).toContain(null);
  });

  it('deleting an imported Transaction leaves the other side unlinked', async () => {
    const { out, into } = await pair();
    await linkTransfer(t.ctx, { transactionIds: [out, into] });

    await deleteImportedTransaction(t.ctx, out);

    expect((await getTransaction(t.ctx, into)).transferId).toBeNull();
  });

  it("refuses to flip the sign of a Manual transaction that's in a Transfer", async () => {
    const ubs = await account('UBS');
    const bcge = await account('BCGE');
    const manual = await createManualTransaction(t.ctx, {
      accountId: ubs.id,
      bookingDate: '2025-10-10',
      amountMinor: 200000,
      description: 'From BCGE',
    });
    await linkTransfer(t.ctx, {
      transactionIds: [manual.id, await seedOne(bcge, { amountMinor: -200000 })],
    });

    await expect(
      updateManualTransaction(t.ctx, manual.id, {
        bookingDate: '2025-10-10',
        amountMinor: -200000,
        description: 'From BCGE',
      }),
    ).rejects.toThrow(/Unlink the Transfer/);
  });
});
