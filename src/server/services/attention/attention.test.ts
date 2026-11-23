import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { editClassification } from '../transactions';
import { createManualTransaction } from '../transactions/manual';
import { splitTransaction } from '../transactions/split';
import { getClassificationProgress } from '../transactions/unclassified';
import { linkTransfer, splitLineSide, transactionSide, unlinkTransfer } from '../transfers';
import { listAttentionItems, markAttentionSeen } from '.';

const t = setupTestDatabase();

const TODAY = '2025-11-20';

async function manualAccount(name: string): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `${name} bank` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name,
    currency: 'CHF',
    kind: 'current',
    importFormat: null,
    openingBalanceMinor: 0,
    openingDate: '2025-01-01',
  });
}

async function addTransactions(account: Account, amountsMinor: number[]): Promise<string[]> {
  const ids: string[] = [];
  for (const amountMinor of amountsMinor) {
    const transaction = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-11-03',
      amountMinor,
      description: 'Kiosk',
    });
    ids.push(transaction.id);
  }
  return ids;
}

async function groceries() {
  const group = await createCategoryGroup(t.ctx, { name: 'Food', type: 'expense' });
  return createCategory(t.ctx, { groupId: group.id, name: 'Groceries' });
}

describe('Attention items', () => {
  it('lists nothing when there is no data', async () => {
    expect(await listAttentionItems(t.ctx, { today: TODAY })).toEqual([]);
  });

  it('lists one item counting the Unclassified Transactions, linking to Unclassified', async () => {
    const account = await manualAccount('Current');
    const [classified] = await addTransactions(account, [-1_00, -2_00, -3_00, -4_00]);
    await editClassification(t.ctx, classified!, { categoryId: (await groceries()).id });

    const items = await listAttentionItems(t.ctx, { today: TODAY });

    expect(items).toEqual([
      {
        kind: 'unclassified',
        subject: null,
        count: 3,
        href: '/unclassified',
        tone: 'warning',
        unread: true,
      },
    ]);
    expect(items[0]!.count).toBe((await getClassificationProgress(t.ctx)).unclassified);
  });

  it('counts a split Transaction with an Unclassified Split line, as the Unclassified view does', async () => {
    const current = await manualAccount('Current');
    const savings = await manualAccount('Savings');
    const category = await groceries();
    const [split] = await addTransactions(current, [-15_00]);
    const [credit] = await addTransactions(savings, [10_00]);
    const { splitLines } = await splitTransaction(t.ctx, split!, [
      { amountMinor: -10_00, categoryId: category.id },
      { amountMinor: -5_00, categoryId: category.id },
    ]);
    // A Transfer line, once unlinked, has neither a Category nor a Transfer: Unclassified.
    const line = splitLines[0]!.id;
    await linkTransfer(t.ctx, { sides: [splitLineSide(line), transactionSide(credit!)] });
    await unlinkTransfer(t.ctx, splitLineSide(line));
    await editClassification(t.ctx, credit!, { categoryId: category.id });

    const items = await listAttentionItems(t.ctx, { today: TODAY });

    expect(items).toMatchObject([{ kind: 'unclassified', count: 1 }]);
    expect(items[0]!.count).toBe((await getClassificationProgress(t.ctx)).unclassified);
  });

  it('lists nothing once every Transaction is classified', async () => {
    const account = await manualAccount('Current');
    const [only] = await addTransactions(account, [-1_00]);
    await editClassification(t.ctx, only!, { categoryId: (await groceries()).id });

    expect(await listAttentionItems(t.ctx, { today: TODAY })).toEqual([]);
  });

  describe('read and unread', () => {
    async function unread() {
      const items = await listAttentionItems(t.ctx, { today: TODAY });
      return items.map((item) => ({ kind: item.kind, unread: item.unread }));
    }

    it('marks every item unread until the bell is opened, and read after', async () => {
      await addTransactions(await manualAccount('Current'), [-1_00, -2_00]);
      expect(await unread()).toEqual([{ kind: 'unclassified', unread: true }]);

      await markAttentionSeen(t.ctx, { today: TODAY });

      expect(await unread()).toEqual([{ kind: 'unclassified', unread: false }]);
    });

    it('marks Unclassified unread again when more Transactions are Unclassified', async () => {
      const account = await manualAccount('Current');
      await addTransactions(account, [-1_00, -2_00]);
      await markAttentionSeen(t.ctx, { today: TODAY });

      await addTransactions(account, [-3_00]);

      expect(await unread()).toEqual([{ kind: 'unclassified', unread: true }]);
    });

    it('keeps Unclassified read when some are classified, even if a few come back', async () => {
      const account = await manualAccount('Current');
      const category = await groceries();
      const [first, second] = await addTransactions(account, [-1_00, -2_00, -3_00]);
      await markAttentionSeen(t.ctx, { today: TODAY });

      await editClassification(t.ctx, first!, { categoryId: category.id });
      await editClassification(t.ctx, second!, { categoryId: category.id });
      expect(await unread()).toEqual([{ kind: 'unclassified', unread: false }]);

      // Up to 2 again: still fewer than the 3 the bell showed.
      await addTransactions(account, [-4_00]);
      expect(await unread()).toEqual([{ kind: 'unclassified', unread: false }]);
    });

    it('drops the item once all are classified, and marks it unread when more appear', async () => {
      const account = await manualAccount('Current');
      const category = await groceries();
      const ids = await addTransactions(account, [-1_00, -2_00]);
      await markAttentionSeen(t.ctx, { today: TODAY });
      for (const id of ids) await editClassification(t.ctx, id, { categoryId: category.id });
      // The bell renders without the item: it went away.
      expect(await unread()).toEqual([]);

      // Fewer than the 2 the bell showed, but the item went away in between: news again.
      await addTransactions(account, [-3_00]);

      expect(await unread()).toEqual([{ kind: 'unclassified', unread: true }]);
    });
  });

  it('refuses a today that is not a date', async () => {
    await expect(listAttentionItems(t.ctx, { today: 'tomorrow' })).rejects.toThrow();
    await expect(markAttentionSeen(t.ctx, { today: 'tomorrow' })).rejects.toThrow();
  });
});
