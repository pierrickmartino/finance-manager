import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import {
  dismissRecurringPayment,
  listRecurringPayments,
  restoreRecurringPayment,
} from '../recurring-payments';
import { editClassification } from '../transactions';
import { createManualTransaction } from '../transactions/manual';
import { listAttentionItems, markAttentionSeen } from '.';

const t = setupTestDatabase();

/**
 * Monthly charges on the 5th from January to March: next expected on 5 April, and with the grace
 * of a quarter of a month (8 days) Missed from 14 April.
 */
const DATES = ['2025-01-05', '2025-02-05', '2025-03-05'];
/** After the grace, before the series would be Ended (5 May plus a day). */
const TODAY = '2025-04-20';

let accountCount = 0;
/**
 * An Account. Entered by hand by default, so its data is taken to be complete and an overdue
 * series on it is Missed; with an Import format and no Import it is Stale, so "Not yet imported".
 */
async function account(importFormat: 'ubs_csv' | null = null): Promise<Account> {
  accountCount += 1;
  const bank = await createBank(t.ctx, { name: `Bank ${accountCount}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: `Account ${accountCount}`,
    currency: 'CHF',
    kind: 'current',
    importFormat,
    openingBalanceMinor: 0,
    openingDate: '2022-01-01',
  });
}

let streaming: Category;

beforeEach(async () => {
  const leisure = await createCategoryGroup(t.ctx, { name: 'Leisure', type: 'expense' });
  streaming = await createCategory(t.ctx, { groupId: leisure.id, name: 'Streaming' });
});

/** Charges `payeeName` each amount (minor units, an expense negative) on its date, classified. */
async function charge(
  on: Account,
  payeeName: string,
  rows: { date: string; amount: number }[],
): Promise<void> {
  for (const row of rows) {
    const transaction = await createManualTransaction(t.ctx, {
      accountId: on.id,
      bookingDate: row.date,
      amountMinor: row.amount,
      description: payeeName,
    });
    await editClassification(t.ctx, transaction.id, { categoryId: streaming.id, payeeName });
  }
}

const each = (dates: string[], amount: number) => dates.map((date) => ({ date, amount }));

/** The Recurring payment items listed on `today`, leaving out other kinds. */
async function recurringItems(today = TODAY) {
  const items = await listAttentionItems(t.ctx, { today });
  return items.filter((item) => item.kind === 'missed' || item.kind === 'price_increase');
}

describe('Recurring payment Attention items', () => {
  it('lists a Missed Recurring payment with its Payee and expected date, linking to Recurring payments', async () => {
    await charge(await account(), 'Netflix', each(DATES, -2190));

    const items = await recurringItems();

    expect(items).toEqual([
      {
        kind: 'missed',
        subject: expect.any(String),
        payeeName: 'Netflix',
        expectedDate: '2025-04-05',
        href: '/recurring-payments',
        tone: 'warning',
        unread: true,
      },
    ]);
  });

  it('lists a Recurring payment with a Price increase, with both amounts', async () => {
    await charge(await account(), 'Spotify', [
      ...each(['2025-01-10', '2025-02-10', '2025-03-10'], -1290),
      { date: '2025-04-10', amount: -1490 },
    ]);

    const items = await recurringItems();

    expect(items).toEqual([
      {
        kind: 'price_increase',
        subject: expect.any(String),
        payeeName: 'Spotify',
        currency: 'CHF',
        previousAmountMinor: 1290,
        lastAmountMinor: 1490,
        lastCharge: expect.stringMatching(/^transaction:/),
        href: '/recurring-payments',
        tone: 'warning',
        unread: true,
      },
    ]);
  });

  it('lists both items, Missed first, for a Missed Recurring payment that went up', async () => {
    await charge(await account(), 'Netflix', [
      ...each(DATES.slice(0, 2), -2190),
      { date: DATES[2]!, amount: -2490 },
    ]);

    expect((await recurringItems()).map((item) => item.kind)).toEqual(['missed', 'price_increase']);
  });

  describe('leaves out', () => {
    it('a New Recurring payment that is neither Missed nor dearer', async () => {
      await charge(
        await account(),
        'Netflix',
        each(['2025-02-05', '2025-03-05', '2025-04-05'], -2190),
      );
      const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });
      expect(recurringPayments).toMatchObject([{ state: 'active', flags: ['new'] }]);

      expect(await recurringItems()).toEqual([]);
    });

    it('an Ended Recurring payment, even one that went up', async () => {
      await charge(await account(), 'Netflix', [
        ...each(['2024-10-05', '2024-11-05'], -2190),
        { date: '2024-12-05', amount: -2490 },
      ]);
      const { ended } = await listRecurringPayments(t.ctx, { today: TODAY });
      expect(ended).toHaveLength(1);

      expect(await recurringItems()).toEqual([]);
    });

    it('a "Not yet imported" Recurring payment, even one that went up', async () => {
      await charge(await account('ubs_csv'), 'Netflix', [
        ...each(DATES.slice(0, 2), -2190),
        { date: DATES[2]!, amount: -2490 },
      ]);
      const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });
      expect(recurringPayments).toMatchObject([{ state: 'not_yet_imported' }]);

      expect(await recurringItems()).toEqual([]);
    });

    it('a Dismissed Recurring payment, until its Dismissal is restored', async () => {
      await charge(await account(), 'Netflix', [
        ...each(DATES.slice(0, 2), -2190),
        { date: DATES[2]!, amount: -2490 },
      ]);
      const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });
      const dismissal = await dismissRecurringPayment(t.ctx, {
        charges: recurringPayments[0]!.charges,
      });
      expect(await recurringItems()).toEqual([]);

      await restoreRecurringPayment(t.ctx, dismissal.id);

      expect((await recurringItems()).map((item) => item.kind)).toEqual([
        'missed',
        'price_increase',
      ]);
    });
  });

  describe('read and unread', () => {
    async function unread(today = TODAY) {
      const items = await recurringItems(today);
      return items.map((item) => ({ kind: item.kind, unread: item.unread }));
    }

    it('keeps an unchanged Missed item read, on later days too', async () => {
      await charge(await account(), 'Netflix', each(DATES, -2190));
      await markAttentionSeen(t.ctx, { today: '2025-04-14' });

      expect(await unread()).toEqual([{ kind: 'missed', unread: false }]);
    });

    it('marks the same Recurring payment unread when it is Missed again on a later expected date', async () => {
      const netflix = await account();
      await charge(netflix, 'Netflix', each(DATES, -2190));
      await markAttentionSeen(t.ctx, { today: TODAY });

      // The April charge arrives late, then May's is Missed: next expected on 5 May.
      await charge(netflix, 'Netflix', each(['2025-04-05'], -2190));

      const items = await recurringItems('2025-05-20');
      expect(items).toMatchObject([{ kind: 'missed', expectedDate: '2025-05-05', unread: true }]);
    });

    it('drops a Missed item once its charge arrives', async () => {
      const netflix = await account();
      await charge(netflix, 'Netflix', each(DATES, -2190));
      await markAttentionSeen(t.ctx, { today: TODAY });

      await charge(netflix, 'Netflix', each(['2025-04-18'], -2190));

      expect(await unread()).toEqual([]);
    });

    it('keeps a Missed item read as its oldest charges leave the recognition window', async () => {
      // Monthly on the 5th since June 2022, after an early charge on 1 May 2022.
      const months = Array.from({ length: 34 }, (_, index) =>
        new Date(Date.UTC(2022, 5 + index, 5)).toISOString().slice(0, 10),
      );
      expect(months.at(-1)).toBe('2025-03-05');
      await charge(await account(), 'Netflix', each(['2022-05-01', ...months], -2190));
      const firstCharge = async (today: string) => {
        const { recurringPayments } = await listRecurringPayments(t.ctx, { today });
        return recurringPayments[0]!.charges[0];
      };
      // The 36-month window starts on 14 April 2022, then on 3 May 2022: 1 May leaves it.
      await markAttentionSeen(t.ctx, { today: '2025-04-14' });
      expect(await firstCharge('2025-04-14')).not.toEqual(await firstCharge('2025-05-03'));

      expect(await unread('2025-05-03')).toEqual([{ kind: 'missed', unread: false }]);
    });

    it('marks a new Price increase unread, and keeps an unchanged one read', async () => {
      const spotify = await account();
      await charge(spotify, 'Spotify', [
        ...each(['2025-01-10', '2025-02-10', '2025-03-10'], -1290),
        { date: '2025-04-10', amount: -1490 },
      ]);
      await markAttentionSeen(t.ctx, { today: TODAY });
      expect(await unread('2025-04-25')).toEqual([{ kind: 'price_increase', unread: false }]);

      await charge(spotify, 'Spotify', [{ date: '2025-05-10', amount: -1690 }]);

      expect(await unread('2025-05-12')).toEqual([{ kind: 'price_increase', unread: true }]);
    });

    it('drops a Price increase once the next charge comes at the same price', async () => {
      const spotify = await account();
      await charge(spotify, 'Spotify', [
        ...each(['2025-01-10', '2025-02-10', '2025-03-10'], -1290),
        { date: '2025-04-10', amount: -1490 },
      ]);
      await markAttentionSeen(t.ctx, { today: TODAY });

      await charge(spotify, 'Spotify', [{ date: '2025-05-10', amount: -1490 }]);

      expect(await unread('2025-05-12')).toEqual([]);
    });

    it('marks items unread again when a restored Dismissal brings them back', async () => {
      await charge(await account(), 'Netflix', each(DATES, -2190));
      await markAttentionSeen(t.ctx, { today: TODAY });
      const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });
      const dismissal = await dismissRecurringPayment(t.ctx, {
        charges: recurringPayments[0]!.charges,
      });
      expect(await unread()).toEqual([]);

      await restoreRecurringPayment(t.ctx, dismissal.id);

      expect(await unread()).toEqual([{ kind: 'missed', unread: true }]);
    });
  });

  it('tells apart two series of one Payee charging two amounts', async () => {
    const card = await account();
    await charge(card, 'Apple', each(DATES, -300));
    await charge(card, 'Apple', each(DATES, -1500));

    const items = await recurringItems();

    expect(items.map((item) => item.kind)).toEqual(['missed', 'missed']);
    expect(new Set(items.map((item) => item.subject)).size).toBe(2);
    await markAttentionSeen(t.ctx, { today: TODAY });
    expect((await recurringItems()).map((item) => item.unread)).toEqual([false, false]);
  });
});
