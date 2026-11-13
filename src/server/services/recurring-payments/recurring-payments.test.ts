import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { editClassification, type ClassificationChanges } from '../transactions';
import { linkTransfer } from '../transfers';
import { listRecurringPayments } from '.';

const t = setupTestDatabase();

let accountCount = 0;
async function account(
  currency = 'CHF',
  importFormat: 'ubs_csv' | null = 'ubs_csv',
): Promise<Account> {
  accountCount += 1;
  const bank = await createBank(t.ctx, { name: `Bank ${accountCount}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: `Account ${accountCount}`,
    currency,
    iban: null,
    kind: 'current',
    importFormat,
    openingBalanceMinor: 0,
  });
}

/**
 * Seeds one Import on `on` whose unclassified Transactions are booked on `dates`: it covers the
 * days from the first to the last of them.
 */
async function imported(on: Account, dates: string[]): Promise<void> {
  await seedTransactions(
    t.ctx.db,
    on,
    dates.map((bookingDate) => ({ bookingDate, amountMinor: -100 })),
  );
}

let subscriptions: Category;

beforeEach(async () => {
  const leisure = await createCategoryGroup(t.ctx, { name: 'Leisure', type: 'expense' });
  subscriptions = await createCategory(t.ctx, { groupId: leisure.id, name: 'Streaming' });
});

interface Charge {
  date: string;
  /** Minor units, signed as the bank books it (an expense is negative). */
  amount: number;
  classify?: ClassificationChanges;
}

/**
 * Seeds Transactions on `on`, each classified under the Streaming expense Category with the given
 * Payee unless it says otherwise. Returns their ids in order.
 */
async function charges(on: Account, payeeName: string | null, rows: Charge[]): Promise<string[]> {
  const ids = await seedTransactions(
    t.ctx.db,
    on,
    rows.map((row) => ({ bookingDate: row.date, amountMinor: row.amount })),
  );
  for (const [index, row] of rows.entries()) {
    const classify = row.classify ?? {
      categoryId: subscriptions.id,
      ...(payeeName === null ? {} : { payeeName }),
    };
    await editClassification(t.ctx, ids[index]!, classify);
  }
  return ids;
}

const monthly = (dates: string[], amount: number): Charge[] =>
  dates.map((date) => ({ date, amount }));

describe('recognising a monthly Recurring payment', () => {
  it('recognises three charges a month apart with its last amount, yearly cost and next date', async () => {
    const card = await account();
    const ids = await charges(
      card,
      'Netflix',
      monthly(['2025-08-05', '2025-09-05', '2025-10-06'], -2190),
    );

    const result = await listRecurringPayments(t.ctx, { today: '2025-11-01' });

    expect(result.totalYearlyCostMinor).toBe(26280);
    expect(result.recurringPayments).toHaveLength(1);
    expect(result.recurringPayments[0]).toMatchObject({
      payee: { name: 'Netflix' },
      currency: 'CHF',
      cadence: 'monthly',
      chargesPerYear: 12,
      lastAmountMinor: 2190,
      lastChargeDate: '2025-10-06',
      nextExpectedDate: '2025-11-06',
      yearlyCost: { amountMinor: 26280, rate: { currency: 'CHF', rateToChf: '1' } },
      state: 'active',
      charges: ids.map((id) => ({ kind: 'transaction', id, accountId: card.id })),
    });
  });
});

describe('the monthly interval and charge count', () => {
  it('accepts gaps of 25 and 36 days as monthly', async () => {
    await charges(
      await account(),
      'Gym',
      monthly(['2025-01-01', '2025-01-26', '2025-03-03'], -5000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-10' });

    expect(recurringPayments.map((payment) => payment.cadence)).toEqual(['monthly']);
  });

  it('does not recognise a series with a gap of 24 days', async () => {
    await charges(
      await account(),
      'Gym',
      monthly(['2025-01-01', '2025-01-25', '2025-02-25'], -5000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-10' });

    expect(recurringPayments).toEqual([]);
  });

  it('does not recognise a series with a gap of 37 days', async () => {
    await charges(
      await account(),
      'Gym',
      monthly(['2025-01-01', '2025-02-07', '2025-03-07'], -5000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-10' });

    expect(recurringPayments).toEqual([]);
  });

  it('needs three charges: two a month apart are not a Recurring payment', async () => {
    await charges(await account(), 'Gym', monthly(['2025-01-01', '2025-02-01'], -5000));

    const { recurringPayments, totalYearlyCostMinor } = await listRecurringPayments(t.ctx, {
      today: '2025-03-10',
    });

    expect(recurringPayments).toEqual([]);
    expect(totalYearlyCostMinor).toBe(0);
  });

  it('ignores weekly charges', async () => {
    await charges(
      await account(),
      'Migros',
      monthly(['2025-01-04', '2025-01-11', '2025-01-18', '2025-01-25', '2025-02-01'], -8000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-10' });

    expect(recurringPayments).toEqual([]);
  });
});

describe('series by amount, Payee, Currency and Account', () => {
  it('continues a series through a 20% rise then a 20% fall', async () => {
    await charges(await account(), 'Spotify', [
      { date: '2025-01-10', amount: -1000 },
      { date: '2025-02-10', amount: -1200 },
      { date: '2025-03-10', amount: -960 },
    ]);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-20' });

    expect(recurringPayments).toMatchObject([
      { payee: { name: 'Spotify' }, lastAmountMinor: 960, previousAmountMinor: 1200 },
    ]);
  });

  it('starts a new series for a charge more than 20% above or below the previous one', async () => {
    await charges(await account(), 'Spotify', [
      { date: '2025-01-10', amount: -1000 },
      { date: '2025-02-10', amount: -1000 },
      { date: '2025-03-10', amount: -1000 },
      { date: '2025-04-10', amount: -1201 },
      { date: '2025-04-11', amount: -799 },
    ]);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-20' });

    expect(recurringPayments).toMatchObject([
      { lastAmountMinor: 1000, lastChargeDate: '2025-03-10', charges: { length: 3 } },
    ]);
  });

  it('gives a Payee charging two distinct amounts two Recurring payments', async () => {
    const card = await account();
    await charges(card, 'Swisscom', [
      { date: '2025-01-15', amount: -4900 },
      { date: '2025-01-16', amount: -7900 },
      { date: '2025-02-15', amount: -4900 },
      { date: '2025-02-16', amount: -7900 },
      { date: '2025-03-15', amount: -4900 },
      { date: '2025-03-16', amount: -7900 },
    ]);

    const { recurringPayments, totalYearlyCostMinor } = await listRecurringPayments(t.ctx, {
      today: '2025-03-20',
    });

    expect(recurringPayments).toMatchObject([
      { payee: { name: 'Swisscom' }, lastAmountMinor: 7900, yearlyCost: { amountMinor: 94800 } },
      { payee: { name: 'Swisscom' }, lastAmountMinor: 4900, yearlyCost: { amountMinor: 58800 } },
    ]);
    expect(totalYearlyCostMinor).toBe(153600);
  });

  it('spans Accounts in the same Currency in one series', async () => {
    const [debit, credit] = [await account(), await account()];
    const [first, second] = await charges(
      debit,
      'Netflix',
      monthly(['2025-01-05', '2025-02-05'], -2190),
    );
    const [third] = await charges(credit, 'Netflix', monthly(['2025-03-05'], -2190));

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-20' });

    expect(recurringPayments).toMatchObject([
      {
        charges: [
          { id: first, accountId: debit.id },
          { id: second, accountId: debit.id },
          { id: third, accountId: credit.id },
        ],
      },
    ]);
  });

  it('gives a Payee paid in CHF and in EUR a series in each Currency', async () => {
    await seedEurRates(t.ctx, [['2025-01-02', '0.94']]);
    await charges(
      await account('CHF'),
      'Adobe',
      monthly(['2025-01-08', '2025-02-08', '2025-03-08'], -3000),
    );
    await charges(
      await account('EUR'),
      'Adobe',
      monthly(['2025-01-09', '2025-02-09', '2025-03-09'], -3000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-20' });

    expect(recurringPayments).toMatchObject([
      { payee: { name: 'Adobe' }, currency: 'CHF', lastAmountMinor: 3000 },
      { payee: { name: 'Adobe' }, currency: 'EUR', lastAmountMinor: 3000 },
    ]);
  });
});

describe('what counts as a charge', () => {
  const DATES = ['2025-01-20', '2025-02-20', '2025-03-20'];
  const TODAY = '2025-03-25';

  async function group(type: 'income' | 'capital', name: string): Promise<Category> {
    const created = await createCategoryGroup(t.ctx, { name, type });
    return createCategory(t.ctx, { groupId: created.id, name: `${name} category` });
  }

  it('ignores Transactions under an Income Category', async () => {
    const salary = await group('income', 'Income');
    await charges(
      await account(),
      'Employer',
      DATES.map((date) => ({
        date,
        amount: 650000,
        classify: { categoryId: salary.id, payeeName: 'Employer' },
      })),
    );

    expect((await listRecurringPayments(t.ctx, { today: TODAY })).recurringPayments).toEqual([]);
  });

  it('ignores Transactions under a Capital Category', async () => {
    const shares = await group('capital', 'Capital');
    await charges(
      await account(),
      'Broker',
      DATES.map((date) => ({
        date,
        amount: -50000,
        classify: { categoryId: shares.id, payeeName: 'Broker' },
      })),
    );

    expect((await listRecurringPayments(t.ctx, { today: TODAY })).recurringPayments).toEqual([]);
  });

  it('ignores Unclassified Transactions, even with a Payee', async () => {
    await charges(
      await account(),
      'Landlord',
      DATES.map((date) => ({ date, amount: -180000, classify: { payeeName: 'Landlord' } })),
    );

    expect((await listRecurringPayments(t.ctx, { today: TODAY })).recurringPayments).toEqual([]);
  });

  it('ignores expenses with no Payee', async () => {
    await charges(await account(), null, monthly(DATES, -2000));

    expect((await listRecurringPayments(t.ctx, { today: TODAY })).recurringPayments).toEqual([]);
  });

  it('ignores refunds booked under an Expense Category', async () => {
    await charges(await account(), 'Insurer', monthly(DATES, 2000));

    expect((await listRecurringPayments(t.ctx, { today: TODAY })).recurringPayments).toEqual([]);
  });

  it('ignores Transfers', async () => {
    const [current, savings] = [await account(), await account()];
    const outs = await charges(current, 'Savings plan', monthly(DATES, -50000));
    const ins = await seedTransactions(
      t.ctx.db,
      savings,
      DATES.map((date) => ({ bookingDate: date, amountMinor: 50000 })),
    );
    for (const [index, id] of outs.entries()) {
      await linkTransfer(t.ctx, {
        sides: [
          { kind: 'transaction', id },
          { kind: 'transaction', id: ins[index]! },
        ],
      });
    }

    expect((await listRecurringPayments(t.ctx, { today: TODAY })).recurringPayments).toEqual([]);
  });
});

describe('the 36-month window', () => {
  it('counts a charge booked exactly 36 months before today', async () => {
    await charges(
      await account(),
      'Domain',
      monthly(['2022-11-12', '2022-12-12', '2023-01-12'], -1500),
    );

    const { ended } = await listRecurringPayments(t.ctx, { today: '2025-11-12' });

    expect(ended).toMatchObject([{ payee: { name: 'Domain' }, charges: { length: 3 } }]);
  });

  it('leaves out charges booked earlier than that', async () => {
    await charges(
      await account(),
      'Domain',
      monthly(['2022-11-11', '2022-12-11', '2023-01-11'], -1500),
    );

    const { recurringPayments, ended } = await listRecurringPayments(t.ctx, {
      today: '2025-11-12',
    });

    expect([...recurringPayments, ...ended]).toEqual([]);
  });
});

describe('yearly cost and next expected date', () => {
  it("converts an EUR series' yearly cost at the rate on its last charge's date", async () => {
    await seedEurRates(t.ctx, [
      ['2025-09-01', '0.9000'],
      ['2025-10-03', '0.9300'],
      ['2025-10-06', '0.9500'],
    ]);
    // The last charge is on a Saturday: Friday's rate applies.
    await charges(
      await account('EUR'),
      'Deezer',
      monthly(['2025-08-04', '2025-09-04', '2025-10-04'], -999),
    );

    const { recurringPayments, totalYearlyCostMinor } = await listRecurringPayments(t.ctx, {
      today: '2025-10-20',
    });

    expect(recurringPayments).toMatchObject([
      {
        currency: 'EUR',
        lastAmountMinor: 999,
        yearlyCost: {
          amountMinor: 11149,
          rate: { currency: 'EUR', date: '2025-10-04', rateDate: '2025-10-03', rateToChf: '0.93' },
        },
      },
    ]);
    expect(totalYearlyCostMinor).toBe(11149);
  });

  it('has no yearly cost, and adds nothing to the total, before any rate exists', async () => {
    await charges(
      await account('EUR'),
      'Deezer',
      monthly(['2025-08-04', '2025-09-04', '2025-10-04'], -999),
    );

    const { recurringPayments, totalYearlyCostMinor } = await listRecurringPayments(t.ctx, {
      today: '2025-10-20',
    });

    expect(recurringPayments).toMatchObject([{ lastAmountMinor: 999, yearlyCost: null }]);
    expect(totalYearlyCostMinor).toBe(0);
  });

  it('lists the highest yearly cost first and totals them', async () => {
    const card = await account();
    await charges(card, 'Cloud', monthly(['2025-01-03', '2025-02-03', '2025-03-03'], -299));
    await charges(
      card,
      'Health insurer',
      monthly(['2025-01-01', '2025-02-01', '2025-03-01'], -41250),
    );
    await charges(card, 'Newspaper', monthly(['2025-01-07', '2025-02-07', '2025-03-07'], -2400));

    const { recurringPayments, totalYearlyCostMinor } = await listRecurringPayments(t.ctx, {
      today: '2025-03-20',
    });

    expect(recurringPayments.map((payment) => payment.payee.name)).toEqual([
      'Health insurer',
      'Newspaper',
      'Cloud',
    ]);
    expect(totalYearlyCostMinor).toBe(495000 + 28800 + 3588);
  });

  it('expects a charge on 31 January next at the end of February', async () => {
    await charges(
      await account(),
      'Rent',
      monthly(['2024-11-30', '2024-12-31', '2025-01-31'], -150000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-02-10' });

    expect(recurringPayments).toMatchObject([{ nextExpectedDate: '2025-02-28' }]);
  });
});

describe('the price increase flag', () => {
  it('flags a last charge higher than the one before, with both amounts', async () => {
    await charges(await account(), 'Spotify', [
      { date: '2024-12-10', amount: -1000 },
      { date: '2025-01-10', amount: -1000 },
      { date: '2025-02-10', amount: -1000 },
      { date: '2025-03-10', amount: -1001 },
    ]);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-20' });

    expect(recurringPayments).toMatchObject([
      { flags: ['price_increase'], previousAmountMinor: 1000, lastAmountMinor: 1001 },
    ]);
  });

  it('does not flag an unchanged or lower last charge', async () => {
    const card = await account();
    await charges(card, 'Spotify', monthly(['2024-12-10', '2025-01-10', '2025-02-10'], -1000));
    await charges(card, 'Cloud', [
      { date: '2024-12-10', amount: -1000 },
      { date: '2025-01-10', amount: -1000 },
      { date: '2025-02-10', amount: -1200 },
      { date: '2025-03-10', amount: -1100 },
    ]);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-20' });

    expect(recurringPayments).toMatchObject([
      { payee: { name: 'Cloud' }, flags: [] },
      { payee: { name: 'Spotify' }, flags: [] },
    ]);
  });

  it('stops flagging once the next charge is at the same amount', async () => {
    await charges(await account(), 'Spotify', [
      { date: '2025-01-10', amount: -1000 },
      { date: '2025-02-10', amount: -1000 },
      { date: '2025-03-10', amount: -1100 },
      { date: '2025-04-10', amount: -1100 },
    ]);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-20' });

    expect(recurringPayments).toMatchObject([{ flags: [] }]);
  });
});

describe('the New flag', () => {
  it('flags a series whose first charge is 90 days before today', async () => {
    await charges(
      await account(),
      'Gym',
      monthly(['2025-01-20', '2025-02-20', '2025-03-20'], -5000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-20' });

    expect(recurringPayments).toMatchObject([{ flags: ['new'] }]);
  });

  it('does not flag a series whose first charge is 91 days before today', async () => {
    await charges(
      await account(),
      'Gym',
      monthly(['2025-01-19', '2025-02-19', '2025-03-19'], -5000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-20' });

    expect(recurringPayments).toMatchObject([{ flags: [] }]);
  });

  it('flags a new series whose last charge went up as both', async () => {
    await charges(await account(), 'Gym', [
      { date: '2025-01-20', amount: -5000 },
      { date: '2025-02-20', amount: -5000 },
      { date: '2025-03-20', amount: -5500 },
    ]);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-01' });

    expect(recurringPayments).toMatchObject([{ flags: ['price_increase', 'new'] }]);
  });
});

describe('the Ended state', () => {
  const DATES = ['2025-01-05', '2025-02-05', '2025-03-05'];

  it('is not Ended on the day two full cadences after its last charge', async () => {
    await charges(await account('CHF', null), 'Gym', monthly(DATES, -5000));

    const result = await listRecurringPayments(t.ctx, { today: '2025-05-05' });

    expect(result.recurringPayments).toMatchObject([{ payee: { name: 'Gym' } }]);
    expect(result.ended).toEqual([]);
    expect(result.totalYearlyCostMinor).toBe(60000);
  });

  it('is Ended the day after, in its own list and out of the total', async () => {
    await charges(await account('CHF', null), 'Gym', monthly(DATES, -5000));

    const result = await listRecurringPayments(t.ctx, { today: '2025-05-06' });

    expect(result.recurringPayments).toEqual([]);
    expect(result.ended).toMatchObject([
      { payee: { name: 'Gym' }, state: 'ended', yearlyCost: { amountMinor: 60000 } },
    ]);
    expect(result.totalYearlyCostMinor).toBe(0);
  });

  it('becomes active again, and is not New, when a charge continues it', async () => {
    await charges(
      await account(),
      'Gym',
      monthly(['2024-10-05', '2024-11-05', '2024-12-05', '2025-03-10'], -5000),
    );

    const result = await listRecurringPayments(t.ctx, { today: '2025-03-20' });

    expect(result.ended).toEqual([]);
    expect(result.recurringPayments).toMatchObject([
      {
        state: 'active',
        flags: [],
        lastChargeDate: '2025-03-10',
        nextExpectedDate: '2025-04-10',
        charges: { length: 4 },
      },
    ]);
  });

  it('is not recognised from a single charge after old one-off charges', async () => {
    await charges(
      await account(),
      'Gym',
      monthly(['2024-06-05', '2024-10-05', '2025-03-10'], -5000),
    );

    const result = await listRecurringPayments(t.ctx, { today: '2025-03-20' });

    expect(result.recurringPayments).toEqual([]);
    expect(result.ended).toEqual([]);
  });
});

describe('the Missed state and "Not yet imported"', () => {
  // Next expected on 5 April; the grace of a quarter of a month (8 days) runs to 13 April.
  const DATES = ['2025-01-05', '2025-02-05', '2025-03-05'];

  it('is still active on the last day of the grace', async () => {
    const card = await account();
    await charges(card, 'Gym', monthly(DATES, -5000));
    await imported(card, ['2025-03-06', '2025-04-13']);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-13' });

    expect(recurringPayments).toMatchObject([{ state: 'active' }]);
  });

  it('is Missed the day after, when its Account has data through the grace, and stays in the total', async () => {
    const card = await account();
    await charges(card, 'Gym', monthly(DATES, -5000));
    await imported(card, ['2025-03-06', '2025-04-13']);

    const result = await listRecurringPayments(t.ctx, { today: '2025-04-14' });

    expect(result.recurringPayments).toMatchObject([
      { state: 'missed', nextExpectedDate: '2025-04-05' },
    ]);
    expect(result.totalYearlyCostMinor).toBe(60000);
  });

  it('is Missed on an Account with no Import format, whose data is all entered by hand', async () => {
    await charges(await account('CHF', null), 'Gym', monthly(DATES, -5000));

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-14' });

    expect(recurringPayments).toMatchObject([{ state: 'missed' }]);
  });

  it('is "Not yet imported" when its Account\'s data ends the day before the grace does', async () => {
    const card = await account();
    await charges(card, 'Gym', monthly(DATES, -5000));
    await imported(card, ['2025-03-06', '2025-04-12']);

    const result = await listRecurringPayments(t.ctx, { today: '2025-04-14' });

    expect(result.recurringPayments).toMatchObject([{ state: 'not_yet_imported' }]);
    expect(result.totalYearlyCostMinor).toBe(60000);
  });

  it('is "Not yet imported" over a Stale Account', async () => {
    await charges(await account(), 'Gym', monthly(DATES, -5000));

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-20' });

    expect(recurringPayments).toMatchObject([{ state: 'not_yet_imported' }]);
  });

  it('is "Not yet imported" over a Gap after the last charge', async () => {
    const card = await account();
    await charges(card, 'Gym', monthly(DATES, -5000));
    await imported(card, ['2025-03-20', '2025-04-20']);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-20' });

    expect(recurringPayments).toMatchObject([{ state: 'not_yet_imported' }]);
  });

  it('is Missed despite a Gap before the last charge', async () => {
    const card = await account();
    await charges(card, 'Gym', monthly(DATES.slice(0, 2), -5000));
    await charges(card, 'Gym', monthly(DATES.slice(2), -5000));
    await imported(card, ['2025-03-06', '2025-04-14']);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-14' });

    expect(recurringPayments).toMatchObject([{ state: 'missed' }]);
  });

  it("judges the last charge's Account, not an earlier one's", async () => {
    const [current, stale] = [await account(), await account()];
    await charges(current, 'Gym', monthly(DATES.slice(0, 2), -5000));
    await imported(current, ['2025-02-06', '2025-04-14']);
    await charges(stale, 'Gym', monthly(DATES.slice(2), -5000));

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-04-14' });

    expect(recurringPayments).toMatchObject([{ state: 'not_yet_imported' }]);
  });
});
