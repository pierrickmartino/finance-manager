import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { listHistory } from '../history';
import { deleteImportedTransaction } from '../imports';
import { listPayees, mergePayees } from '../payees';
import { editClassification, splitTransaction } from '../transactions';
import {
  dismissRecurringPayment,
  listRecurringPaymentCharges,
  listRecurringPayments,
  restoreRecurringPayment,
  type RecurringPayment,
} from '.';

const t = setupTestDatabase();

let accountCount = 0;
/** An Account, imported by default; with `importFormat` null its Transactions are entered by hand. */
async function account(importFormat: 'ubs_csv' | null = 'ubs_csv'): Promise<Account> {
  accountCount += 1;
  const bank = await createBank(t.ctx, { name: `Bank ${accountCount}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: `Account ${accountCount}`,
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat,
    openingBalanceMinor: 0,
  });
}

let streaming: Category;

beforeEach(async () => {
  const leisure = await createCategoryGroup(t.ctx, { name: 'Leisure', type: 'expense' });
  streaming = await createCategory(t.ctx, { groupId: leisure.id, name: 'Streaming' });
});

/** Seeds an expense of `amount` at `payeeName` under Streaming on each date; returns their ids. */
async function monthly(
  on: Account,
  payeeName: string,
  dates: string[],
  amount: number,
): Promise<string[]> {
  const ids = await seedTransactions(
    t.ctx.db,
    on,
    dates.map((bookingDate) => ({ bookingDate, amountMinor: amount })),
  );
  for (const id of ids) {
    await editClassification(t.ctx, id, { categoryId: streaming.id, payeeName });
  }
  return ids;
}

const TODAY = '2025-04-20';

function named(payments: RecurringPayment[], name: string): RecurringPayment {
  const payment = payments.find((one) => one.payee.name === name);
  if (!payment) throw new Error(`No Recurring payment for ${name}`);
  return payment;
}

describe('dismissing a Recurring payment', () => {
  it('marks the series dismissed and leaves it out of the total', async () => {
    const card = await account();
    await monthly(card, 'Netflix', ['2025-01-05', '2025-02-05', '2025-03-05'], -2190);
    await monthly(card, 'Spotify', ['2025-01-10', '2025-02-10', '2025-03-10'], -1290);
    const before = await listRecurringPayments(t.ctx, { today: TODAY });

    const dismissal = await dismissRecurringPayment(t.ctx, {
      charges: named(before.recurringPayments, 'Spotify').charges,
    });

    const after = await listRecurringPayments(t.ctx, { today: TODAY });
    expect(named(after.recurringPayments, 'Spotify').dismissalId).toBe(dismissal.id);
    expect(named(after.recurringPayments, 'Netflix').dismissalId).toBeNull();
    expect(after.totalYearlyCostMinor).toBe(26280);
  });

  it('still opens the Drill-down of a dismissed series', async () => {
    const ids = await monthly(
      await account(),
      'Spotify',
      ['2025-01-10', '2025-02-10', '2025-03-10'],
      -1290,
    );
    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });
    await dismissRecurringPayment(t.ctx, { charges: recurringPayments[0]!.charges });

    const drill = await listRecurringPaymentCharges(t.ctx, {
      today: TODAY,
      charge: { kind: 'transaction', id: ids[2]! },
    });

    expect(drill.transactions.map((transaction) => transaction.id)).toEqual(ids.toReversed());
  });

  it('records the dismissal in History with its Payee and charges', async () => {
    const ids = await monthly(
      await account(),
      'Spotify',
      ['2025-01-10', '2025-02-10', '2025-03-10'],
      -1290,
    );
    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });

    const dismissal = await dismissRecurringPayment(t.ctx, {
      charges: recurringPayments[0]!.charges,
    });

    const entries = await listHistory(t.ctx, {
      entityType: 'recurring_payment_dismissal',
      entityId: dismissal.id,
    });
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'payee', before: null, after: 'Spotify' }),
        expect.objectContaining({
          field: 'charges',
          before: null,
          after: ids.map((id) => `transaction:${id}`).toSorted(),
        }),
      ]),
    );
  });

  it('refuses charges that do not exist, and no charges at all', async () => {
    await expect(
      dismissRecurringPayment(t.ctx, {
        charges: [{ kind: 'transaction', id: '00000000-0000-4000-8000-000000000000' }],
      }),
    ).rejects.toThrow('no longer exist');
    await expect(dismissRecurringPayment(t.ctx, { charges: [] })).rejects.toThrow(
      'needs its charges',
    );
  });
});

describe('a dismissed series that is Missed or Ended', () => {
  // Next expected on 5 April: Missed after the 8-day grace (14 April), Ended from 6 May.
  const DATES = ['2025-01-05', '2025-02-05', '2025-03-05'];

  it('stays dismissed and out of the total once Missed, and opens its Drill-down', async () => {
    const byHand = await account(null);
    const ids = await monthly(byHand, 'Gym', DATES, -5000);
    await monthly(byHand, 'Netflix', ['2025-02-12', '2025-03-12', '2025-04-12'], -2190);
    const before = await listRecurringPayments(t.ctx, { today: '2025-04-01' });
    const dismissal = await dismissRecurringPayment(t.ctx, {
      charges: named(before.recurringPayments, 'Gym').charges,
    });

    const after = await listRecurringPayments(t.ctx, { today: '2025-04-14' });
    const drill = await listRecurringPaymentCharges(t.ctx, {
      today: '2025-04-14',
      charge: { kind: 'transaction', id: ids[2]! },
    });

    expect(named(after.recurringPayments, 'Gym')).toMatchObject({
      state: 'missed',
      dismissalId: dismissal.id,
    });
    expect(after.totalYearlyCostMinor).toBe(26280);
    expect(drill.recurringPayment.dismissalId).toBe(dismissal.id);
  });

  it('is listed as Ended and dismissed, out of the total, and opens its Drill-down', async () => {
    const card = await account();
    const ids = await monthly(card, 'Gym', DATES, -5000);
    await monthly(card, 'Netflix', ['2025-03-01', '2025-04-01', '2025-05-01'], -2190);
    const before = await listRecurringPayments(t.ctx, { today: '2025-04-01' });
    const dismissal = await dismissRecurringPayment(t.ctx, {
      charges: named(before.recurringPayments, 'Gym').charges,
    });

    const after = await listRecurringPayments(t.ctx, { today: '2025-05-06' });
    const drill = await listRecurringPaymentCharges(t.ctx, {
      today: '2025-05-06',
      charge: { kind: 'transaction', id: ids[2]! },
    });

    expect(after.recurringPayments.map((payment) => payment.payee.name)).toEqual(['Netflix']);
    expect(after.ended).toMatchObject([
      { payee: { name: 'Gym' }, state: 'ended', dismissalId: dismissal.id },
    ]);
    expect(after.totalYearlyCostMinor).toBe(26280);
    expect(drill.recurringPayment).toMatchObject({ state: 'ended', dismissalId: dismissal.id });
    expect(drill.transactions.map((transaction) => transaction.id)).toEqual(ids.toReversed());
  });
});

describe('restoring a dismissed Recurring payment', () => {
  it('lists it again, counts it in the total and records the restore in History', async () => {
    await monthly(await account(), 'Spotify', ['2025-01-10', '2025-02-10', '2025-03-10'], -1290);
    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });
    const dismissal = await dismissRecurringPayment(t.ctx, {
      charges: recurringPayments[0]!.charges,
    });

    await restoreRecurringPayment(t.ctx, dismissal.id);

    const after = await listRecurringPayments(t.ctx, { today: TODAY });
    expect(after.recurringPayments).toMatchObject([{ dismissalId: null }]);
    expect(after.totalYearlyCostMinor).toBe(15480);
    const entries = await listHistory(t.ctx, {
      entityType: 'recurring_payment_dismissal',
      entityId: dismissal.id,
    });
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'payee', before: 'Spotify', after: null }),
      ]),
    );
  });

  it('refuses a dismissal that does not exist', async () => {
    await expect(
      restoreRecurringPayment(t.ctx, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow('Dismissal not found');
    await expect(restoreRecurringPayment(t.ctx, 'not-an-id')).rejects.toThrow(
      'Dismissal not found',
    );
  });
});

describe('a dismissal surviving changes', () => {
  it('stays dismissed when a new charge continues the series', async () => {
    const card = await account();
    await monthly(card, 'Spotify', ['2025-01-10', '2025-02-10', '2025-03-10'], -1290);
    const before = await listRecurringPayments(t.ctx, { today: TODAY });
    const dismissal = await dismissRecurringPayment(t.ctx, {
      charges: before.recurringPayments[0]!.charges,
    });

    await monthly(card, 'Spotify', ['2025-04-10'], -1290);

    const after = await listRecurringPayments(t.ctx, { today: TODAY });
    expect(after.recurringPayments).toMatchObject([
      { lastChargeDate: '2025-04-10', dismissalId: dismissal.id, charges: { length: 4 } },
    ]);
    expect(after.totalYearlyCostMinor).toBe(0);
  });

  it('stays dismissed when its Payee is merged into another one', async () => {
    const card = await account();
    await monthly(card, 'SPOTIFY AB', ['2025-01-10', '2025-02-10', '2025-03-10'], -1290);
    await monthly(card, 'Spotify', ['2025-01-01'], -500);
    const before = await listRecurringPayments(t.ctx, { today: TODAY });
    const source = named(before.recurringPayments, 'SPOTIFY AB');
    const dismissal = await dismissRecurringPayment(t.ctx, { charges: source.charges });

    const payees = await listPayees(t.ctx);
    const byName = (name: string) => payees.find((payee) => payee.name === name)!.id;
    await mergePayees(t.ctx, byName('SPOTIFY AB'), byName('Spotify'));

    const after = await listRecurringPayments(t.ctx, { today: TODAY });
    expect(after.recurringPayments).toMatchObject([
      { payee: { name: 'Spotify' }, dismissalId: dismissal.id },
    ]);
  });
});

describe('dropping references to charges that are gone', () => {
  it('deletes the dismissal once every referenced Transaction is deleted', async () => {
    const card = await account();
    // Ended by TODAY: a dismissal anchors on an Ended series' charges too.
    const ids = await monthly(card, 'Spotify', ['2024-10-10', '2024-11-10', '2024-12-10'], -1290);
    const before = await listRecurringPayments(t.ctx, { today: TODAY });
    const dismissal = await dismissRecurringPayment(t.ctx, {
      charges: before.ended[0]!.charges,
    });

    for (const id of ids) await deleteImportedTransaction(t.ctx, id);
    await monthly(card, 'Spotify', ['2025-01-10', '2025-02-10', '2025-03-10'], -1290);

    const after = await listRecurringPayments(t.ctx, { today: TODAY });
    expect(after.recurringPayments).toMatchObject([{ dismissalId: null }]);
    await expect(restoreRecurringPayment(t.ctx, dismissal.id)).rejects.toThrow(
      'Dismissal not found',
    );
  });

  it('keeps the dismissal while some referenced charges remain', async () => {
    const card = await account();
    const ids = await monthly(
      card,
      'Spotify',
      ['2025-01-10', '2025-02-10', '2025-03-10', '2025-04-10'],
      -1290,
    );
    const before = await listRecurringPayments(t.ctx, { today: TODAY });
    const dismissal = await dismissRecurringPayment(t.ctx, {
      charges: before.recurringPayments[0]!.charges,
    });

    await deleteImportedTransaction(t.ctx, ids[0]!);

    const after = await listRecurringPayments(t.ctx, { today: TODAY });
    expect(after.recurringPayments).toMatchObject([
      { charges: { length: 3 }, dismissalId: dismissal.id },
    ]);
  });

  it('deletes the dismissal when a re-split replaces its Split lines, so the series comes back', async () => {
    const telecom = await createCategoryGroup(t.ctx, { name: 'Telecom', type: 'expense' });
    const mobile = await createCategory(t.ctx, { groupId: telecom.id, name: 'Mobile' });
    const ids = await monthly(
      await account(),
      'Swisscom',
      ['2025-01-12', '2025-02-12', '2025-03-12'],
      -10000,
    );
    const lines = [
      { amountMinor: -6000, categoryId: streaming.id },
      { amountMinor: -4000, categoryId: mobile.id },
    ];
    for (const id of ids) await splitTransaction(t.ctx, id, lines);
    const before = await listRecurringPayments(t.ctx, { today: TODAY });
    const tv = before.recurringPayments.find((payment) => payment.lastAmountMinor === 6000)!;
    const dismissal = await dismissRecurringPayment(t.ctx, { charges: tv.charges });

    for (const id of ids) await splitTransaction(t.ctx, id, lines);

    const after = await listRecurringPayments(t.ctx, { today: TODAY });
    expect(after.recurringPayments).toMatchObject([
      { lastAmountMinor: 6000, dismissalId: null },
      { lastAmountMinor: 4000, dismissalId: null },
    ]);
    await expect(restoreRecurringPayment(t.ctx, dismissal.id)).rejects.toThrow(
      'Dismissal not found',
    );
  });
});
