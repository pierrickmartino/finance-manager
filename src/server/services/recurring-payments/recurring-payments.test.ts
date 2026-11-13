import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedEurRates } from '@test/support/fx';
import { seedTransactions } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup, type Category } from '../categories';
import { createPayee } from '../payees';
import {
  editClassification,
  splitTransaction,
  type ClassificationChanges,
  type SplitLineInput,
} from '../transactions';
import { addDays } from '../fx/dates';
import { linkTransfer } from '../transfers';
import { listRecurringPayments } from '.';

const t = setupTestDatabase();

let accountCount = 0;
async function account(currency = 'CHF'): Promise<Account> {
  accountCount += 1;
  const bank = await createBank(t.ctx, { name: `Bank ${accountCount}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: `Account ${accountCount}`,
    currency,
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
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

/** Charges of `amount` from `start`, each the given number of days after the one before. */
function spaced(start: string, gaps: number[], amount: number): Charge[] {
  const dates = gaps.reduce((all, gap) => [...all, addDays(all.at(-1)!, gap)], [start]);
  return monthly(dates, amount);
}

describe('the quarterly, half-yearly and yearly cadences', () => {
  const TODAY = '2028-06-01';

  async function cadencesOf(gaps: number[]): Promise<string[]> {
    await charges(await account(), 'Insurer', spaced('2025-07-01', gaps, -45000));
    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });
    return recurringPayments.map((payment) => payment.cadence);
  }

  it('accepts gaps of 74 and 109 days as quarterly', async () => {
    expect(await cadencesOf([74, 109])).toEqual(['quarterly']);
  });

  it('does not recognise a quarterly series with a gap of 73 days', async () => {
    expect(await cadencesOf([91, 73])).toEqual([]);
  });

  it('does not recognise a quarterly series with a gap of 110 days', async () => {
    expect(await cadencesOf([110, 91])).toEqual([]);
  });

  it('needs three quarterly charges: two a quarter apart are not a Recurring payment', async () => {
    expect(await cadencesOf([91])).toEqual([]);
  });

  it('accepts gaps of 147 and 219 days as half-yearly', async () => {
    expect(await cadencesOf([147, 219])).toEqual(['half-yearly']);
  });

  it('does not recognise a half-yearly series with a gap of 146 days', async () => {
    expect(await cadencesOf([146])).toEqual([]);
  });

  it('does not recognise a half-yearly series with a gap of 220 days', async () => {
    expect(await cadencesOf([220])).toEqual([]);
  });

  it('recognises two charges half a year apart', async () => {
    expect(await cadencesOf([182])).toEqual(['half-yearly']);
  });

  it('accepts gaps of 293 and 438 days as yearly', async () => {
    expect(await cadencesOf([293, 438])).toEqual(['yearly']);
  });

  it('does not recognise a yearly series with a gap of 292 days', async () => {
    expect(await cadencesOf([292])).toEqual([]);
  });

  it('does not recognise a yearly series with a gap of 439 days', async () => {
    expect(await cadencesOf([439])).toEqual([]);
  });

  it('recognises two charges a year apart', async () => {
    expect(await cadencesOf([365])).toEqual(['yearly']);
  });

  it('never recognises a single charge', async () => {
    expect(await cadencesOf([])).toEqual([]);
  });

  it('does not recognise a series whose gaps fit different cadences', async () => {
    expect(await cadencesOf([91, 182])).toEqual([]);
  });

  it('gives a half-yearly series 2 charges a year and expects the next 6 months on', async () => {
    await charges(await account(), 'Car tax', monthly(['2024-08-31', '2025-02-28'], -30000));

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-03-15' });

    expect(recurringPayments).toMatchObject([
      {
        cadence: 'half-yearly',
        chargesPerYear: 2,
        nextExpectedDate: '2025-08-28',
        yearlyCost: { amountMinor: 60000 },
      },
    ]);
  });

  it('gives a yearly series 1 charge a year and expects the next 12 months on', async () => {
    await charges(await account(), 'Card fee', monthly(['2023-02-28', '2024-02-29'], -9000));

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2024-03-15' });

    expect(recurringPayments).toMatchObject([
      {
        cadence: 'yearly',
        chargesPerYear: 1,
        nextExpectedDate: '2025-02-28',
        yearlyCost: { amountMinor: 9000 },
      },
    ]);
  });

  it('gives a quarterly series 4 charges a year and expects the next 3 months on', async () => {
    await charges(
      await account(),
      'Health insurer',
      monthly(['2025-05-31', '2025-08-31', '2025-11-30'], -120000),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-12-15' });

    expect(recurringPayments).toMatchObject([
      {
        cadence: 'quarterly',
        chargesPerYear: 4,
        nextExpectedDate: '2026-02-28',
        yearlyCost: { amountMinor: 480000 },
      },
    ]);
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

describe('Split lines as charges', () => {
  const DATES = ['2025-01-12', '2025-02-12', '2025-03-12'];
  const TODAY = '2025-03-25';

  /**
   * Seeds a Transaction of `amount` at `payeeName` on each of `DATES` and splits it into
   * `lines`. Returns, per date, the Transaction's id and its Split line ids in order.
   */
  async function splitCharges(
    on: Account,
    payeeName: string,
    amount: number,
    lines: SplitLineInput[],
  ): Promise<{ transactionId: string; lineIds: string[] }[]> {
    const ids = await charges(
      on,
      payeeName,
      DATES.map((date) => ({ date, amount, classify: { payeeName } })),
    );
    const split = [];
    for (const transactionId of ids) {
      const result = await splitTransaction(t.ctx, transactionId, lines);
      split.push({ transactionId, lineIds: result.splitLines.map((line) => line.id) });
    }
    return split;
  }

  it("recognises a series of Split lines under their Transaction's Payee, never the whole Transaction", async () => {
    const telecom = await createCategoryGroup(t.ctx, { name: 'Telecom', type: 'expense' });
    const mobile = await createCategory(t.ctx, { groupId: telecom.id, name: 'Mobile' });
    const card = await account();
    const split = await splitCharges(card, 'Swisscom', -10000, [
      { amountMinor: -6000, categoryId: subscriptions.id },
      { amountMinor: -4000, categoryId: mobile.id },
    ]);

    const { recurringPayments, totalYearlyCostMinor } = await listRecurringPayments(t.ctx, {
      today: TODAY,
    });

    expect(recurringPayments).toMatchObject([
      {
        payee: { name: 'Swisscom' },
        cadence: 'monthly',
        lastAmountMinor: 6000,
        charges: split.map(({ transactionId, lineIds }) => ({
          kind: 'splitLine',
          id: lineIds[0],
          transactionId,
          accountId: card.id,
          amountMinor: 6000,
        })),
      },
      {
        payee: { name: 'Swisscom' },
        lastAmountMinor: 4000,
        charges: split.map(({ lineIds }) => ({ kind: 'splitLine', id: lineIds[1] })),
      },
    ]);
    expect(totalYearlyCostMinor).toBe(120000);
  });

  it('puts a Split line with its own Payee under that Payee', async () => {
    const netflix = await createPayee(t.ctx, 'Netflix');
    await splitCharges(await account(), 'Manor', -7190, [
      { amountMinor: -2190, categoryId: subscriptions.id, payeeId: netflix.id },
      { amountMinor: -5000, categoryId: subscriptions.id },
    ]);

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });

    expect(recurringPayments).toMatchObject([
      { payee: { name: 'Manor' }, lastAmountMinor: 5000 },
      { payee: { name: 'Netflix' }, lastAmountMinor: 2190 },
    ]);
  });

  it('ignores Split lines that are Transfer sides', async () => {
    const [current, savings] = [await account(), await account()];
    const split = await splitCharges(current, 'Bank', -60000, [
      { amountMinor: -50000, categoryId: subscriptions.id },
      { amountMinor: -10000, categoryId: subscriptions.id },
    ]);
    const ins = await seedTransactions(
      t.ctx.db,
      savings,
      DATES.map((date) => ({ bookingDate: date, amountMinor: 50000 })),
    );
    for (const [index, { lineIds }] of split.entries()) {
      await linkTransfer(t.ctx, {
        sides: [
          { kind: 'splitLine', id: lineIds[0]! },
          { kind: 'transaction', id: ins[index]! },
        ],
      });
    }

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: TODAY });

    expect(recurringPayments).toMatchObject([
      { payee: { name: 'Bank' }, lastAmountMinor: 10000, charges: { length: 3 } },
    ]);
  });
});

describe('the 36-month window', () => {
  it('counts a charge booked exactly 36 months before today', async () => {
    await charges(
      await account(),
      'Domain',
      monthly(['2022-11-12', '2022-12-12', '2023-01-12'], -1500),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-11-12' });

    expect(recurringPayments).toMatchObject([
      { payee: { name: 'Domain' }, charges: { length: 3 } },
    ]);
  });

  it('leaves out charges booked earlier than that', async () => {
    await charges(
      await account(),
      'Domain',
      monthly(['2022-11-11', '2022-12-11', '2023-01-11'], -1500),
    );

    const { recurringPayments } = await listRecurringPayments(t.ctx, { today: '2025-11-12' });

    expect(recurringPayments).toEqual([]);
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
