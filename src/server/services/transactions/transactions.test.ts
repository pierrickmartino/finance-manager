import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { NotFoundError, ValidationError } from '../errors';
import { getTransaction, listTransactions, type TransactionQuery } from '.';

const t = setupTestDatabase();

let accountCounter = 0;
async function account(currency = 'CHF'): Promise<Account> {
  accountCounter += 1;
  const bank = await createBank(t.ctx, { name: `Bank ${accountCounter}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: `Account ${accountCounter}`,
    currency,
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

async function seed(target: Account, rows: SeedTransaction[]): Promise<string[]> {
  return seedTransactions(t.ctx.db, target, rows);
}

describe('list Transactions', () => {
  it('lists every Transaction, newest booking date first, same-day ones in reverse bank order', async () => {
    const a = await account();
    const [first, second, third] = await seed(a, [
      { bookingDate: '2025-10-01', amountMinor: -1000, rawDescription: 'first' },
      { bookingDate: '2025-10-05', amountMinor: -2000, rawDescription: 'second' },
      { bookingDate: '2025-10-05', amountMinor: -3000, rawDescription: 'third' },
    ]);

    const page = await listTransactions(t.ctx);

    expect(page.transactions.map((tx) => tx.id)).toEqual([third, second, first]);
    expect(page.total).toBe(3);
    expect(page.transactions[0]).toMatchObject({
      accountId: a.id,
      accountName: a.name,
      bookingDate: '2025-10-05',
      amountMinor: -3000,
      currency: 'CHF',
      rawDescription: 'third',
      isManual: false,
    });
  });

  it('returns one page at a time with the total across all pages', async () => {
    const a = await account();
    const ids = await seed(
      a,
      Array.from({ length: 5 }, (_, day) => ({
        bookingDate: `2025-10-0${day + 1}`,
        amountMinor: -100 * (day + 1),
      })),
    );
    const newestFirst = [...ids].reverse();

    const first = await listTransactions(t.ctx, { pageSize: 2 });
    const third = await listTransactions(t.ctx, { pageSize: 2, page: 3 });
    const beyond = await listTransactions(t.ctx, { pageSize: 2, page: 4 });

    expect(first).toMatchObject({ total: 5, page: 1, pageSize: 2, pageCount: 3 });
    expect(first.transactions.map((tx) => tx.id)).toEqual(newestFirst.slice(0, 2));
    expect(third.transactions.map((tx) => tx.id)).toEqual(newestFirst.slice(4));
    expect(beyond).toMatchObject({ total: 5, transactions: [] });
  });

  it('uses 50 per page by default', async () => {
    const page = await listTransactions(t.ctx);

    expect(page).toMatchObject({ total: 0, page: 1, pageSize: 50, pageCount: 0 });
  });

  it('rejects a page below 1 and a page size over 200', async () => {
    await expect(listTransactions(t.ctx, { page: 0 })).rejects.toThrow(ValidationError);
    await expect(listTransactions(t.ctx, { pageSize: 201 })).rejects.toThrow(ValidationError);
  });
});

/** The raw descriptions of what the query returns, newest first. */
async function descriptions(query: TransactionQuery): Promise<string[]> {
  const page = await listTransactions(t.ctx, query);
  return page.transactions.map((tx) => tx.rawDescription);
}

describe('filter Transactions', () => {
  it('by booking date range, both ends inclusive', async () => {
    const a = await account();
    await seed(a, [
      { bookingDate: '2025-09-30', amountMinor: -1, rawDescription: 'sep 30' },
      { bookingDate: '2025-10-01', amountMinor: -1, rawDescription: 'oct 1' },
      { bookingDate: '2025-10-31', amountMinor: -1, rawDescription: 'oct 31' },
      { bookingDate: '2025-11-01', amountMinor: -1, rawDescription: 'nov 1' },
    ]);

    expect(await descriptions({ from: '2025-10-01', to: '2025-10-31' })).toEqual([
      'oct 31',
      'oct 1',
    ]);
    expect(await descriptions({ from: '2025-10-31' })).toEqual(['nov 1', 'oct 31']);
    expect(await descriptions({ to: '2025-09-30' })).toEqual(['sep 30']);
    expect((await listTransactions(t.ctx, { from: '2025-10-01' })).total).toBe(3);
  });

  it('by Account', async () => {
    const ubs = await account();
    const bcge = await account();
    await seed(ubs, [{ bookingDate: '2025-10-01', amountMinor: -1, rawDescription: 'ubs' }]);
    await seed(bcge, [{ bookingDate: '2025-10-02', amountMinor: -1, rawDescription: 'bcge' }]);

    expect(await descriptions({ accountId: ubs.id })).toEqual(['ubs']);
    expect(await descriptions({ accountId: bcge.id })).toEqual(['bcge']);
  });

  it('by status: imported or manual', async () => {
    const a = await account();
    await seed(a, [
      { bookingDate: '2025-10-01', amountMinor: -1, rawDescription: 'from the bank' },
      { bookingDate: '2025-10-02', amountMinor: -1, rawDescription: 'cash', isManual: true },
    ]);

    expect(await descriptions({ status: 'imported' })).toEqual(['from the bank']);
    expect(await descriptions({ status: 'manual' })).toEqual(['cash']);
    await expect(listTransactions(t.ctx, { status: 'deleted' as 'manual' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('by signed amount range in minor units, both ends inclusive', async () => {
    const a = await account();
    await seed(a, [
      { bookingDate: '2025-10-01', amountMinor: -6490, rawDescription: 'groceries' },
      { bookingDate: '2025-10-02', amountMinor: -215000, rawDescription: 'rent' },
      { bookingDate: '2025-10-03', amountMinor: 650000, rawDescription: 'salary' },
      { bookingDate: '2025-10-04', amountMinor: -5000, rawDescription: 'cinema' },
    ]);

    expect(await descriptions({ amountMin: -10000, amountMax: -5000 })).toEqual([
      'cinema',
      'groceries',
    ]);
    expect(await descriptions({ amountMin: 0 })).toEqual(['salary']);
    expect(await descriptions({ amountMax: -215000 })).toEqual(['rent']);
  });

  it('rejects an amount range whose minimum is above its maximum', async () => {
    await expect(listTransactions(t.ctx, { amountMin: 100, amountMax: -100 })).rejects.toThrow(
      'Minimum amount must not be above maximum amount',
    );
  });

  describe('by free text', () => {
    async function seedTexts(): Promise<void> {
      const a = await account();
      await seed(a, [
        {
          bookingDate: '2025-10-01',
          amountMinor: -1,
          rawDescription: 'CARTE 12.10 CAFÉ DU  MARCHÉ GENÈVE',
        },
        {
          bookingDate: '2025-10-02',
          amountMinor: -1,
          rawDescription: 'e-banking order',
          counterpartyName: 'Société Électrique Zürich',
        },
        {
          bookingDate: '2025-10-03',
          amountMinor: -1,
          rawDescription: 'payment slip',
          paymentReference: 'Facture N° 2025-10/Ärzte',
        },
        { bookingDate: '2025-10-04', amountMinor: -1, rawDescription: 'Migros M-Budget 100%' },
      ]);
    }

    it('matches the raw description ignoring case, accents and repeated spaces', async () => {
      await seedTexts();

      expect(await descriptions({ text: 'cafe du marche' })).toEqual([
        'CARTE 12.10 CAFÉ DU  MARCHÉ GENÈVE',
      ]);
      expect(await descriptions({ text: '  Genève ' })).toEqual([
        'CARTE 12.10 CAFÉ DU  MARCHÉ GENÈVE',
      ]);
    });

    it('matches the counterparty name and the payment reference', async () => {
      await seedTexts();

      expect(await descriptions({ text: 'electrique zurich' })).toEqual(['e-banking order']);
      expect(await descriptions({ text: 'ÄRZTE' })).toEqual(['payment slip']);
    });

    it('treats % and _ as plain characters', async () => {
      await seedTexts();

      expect(await descriptions({ text: '100%' })).toEqual(['Migros M-Budget 100%']);
      expect(await descriptions({ text: '%' })).toEqual(['Migros M-Budget 100%']);
      expect(await descriptions({ text: '_' })).toEqual([]);
    });
  });

  it('combines every filter with AND, and pages through the result', async () => {
    const ubs = await account();
    const other = await account();
    const match = { bookingDate: '2025-10-10', amountMinor: -6490, rawDescription: 'COOP Genève' };
    await seed(ubs, [
      { ...match, rawDescription: 'COOP Genève 1' },
      { ...match, rawDescription: 'COOP Genève 2' },
      { ...match, rawDescription: 'COOP Genève 3' },
      { ...match, rawDescription: 'COOP Genève manual', isManual: true },
      { ...match, rawDescription: 'COOP Genève september', bookingDate: '2025-09-10' },
      { ...match, rawDescription: 'COOP Genève refund', amountMinor: 6490 },
      { ...match, rawDescription: 'Migros Genève' },
    ]);
    await seed(other, [{ ...match, rawDescription: 'COOP Genève other account' }]);
    const query: TransactionQuery = {
      from: '2025-10-01',
      to: '2025-10-31',
      accountId: ubs.id,
      amountMin: -10000,
      amountMax: 0,
      text: 'coop geneve',
      status: 'imported',
    };

    const first = await listTransactions(t.ctx, { ...query, pageSize: 2 });
    const second = await listTransactions(t.ctx, { ...query, pageSize: 2, page: 2 });

    expect(first).toMatchObject({ total: 3, pageCount: 2 });
    expect(first.transactions.map((tx) => tx.rawDescription)).toEqual([
      'COOP Genève 3',
      'COOP Genève 2',
    ]);
    expect(second.transactions.map((tx) => tx.rawDescription)).toEqual(['COOP Genève 1']);
  });

  it('ignores blank filter fields, as an empty form submits them', async () => {
    const a = await account();
    await seed(a, [{ bookingDate: '2025-10-01', amountMinor: -1, rawDescription: 'only' }]);

    expect(await descriptions({ from: '', to: '', accountId: '', status: '', text: '  ' })).toEqual(
      ['only'],
    );
  });

  it('rejects a date range that ends before it starts, and a malformed date', async () => {
    await expect(listTransactions(t.ctx, { from: '2025-10-02', to: '2025-10-01' })).rejects.toThrow(
      'From must not be after To',
    );
    await expect(listTransactions(t.ctx, { from: '01.10.2025' })).rejects.toThrow(ValidationError);
  });
});

describe('get a Transaction', () => {
  it('returns its bank fields, its Account and the Import that brought it in', async () => {
    const a = await account();
    const [id] = await seed(a, [
      {
        bookingDate: '2025-10-10',
        amountMinor: -6490,
        rawDescription: 'COOP Genève',
        counterpartyName: 'Coop',
        counterpartyIban: 'CH9300762011623852957',
        paymentReference: 'RF18539007547034',
      },
    ]);

    const transaction = await getTransaction(t.ctx, id!);

    expect(transaction).toMatchObject({
      id,
      accountId: a.id,
      accountName: a.name,
      isManual: false,
      bookingDate: '2025-10-10',
      amountMinor: -6490,
      currency: 'CHF',
      rawDescription: 'COOP Genève',
      counterpartyName: 'Coop',
      counterpartyIban: 'CH9300762011623852957',
      paymentReference: 'RF18539007547034',
      import: { id: transaction.importId, fileName: 'seed.csv' },
    });
    expect(transaction.import?.importedAt).toBeInstanceOf(Date);
  });

  it('has no Import when it is manual', async () => {
    const a = await account();
    const [id] = await seed(a, [{ bookingDate: '2025-10-10', amountMinor: -500, isManual: true }]);

    expect(await getTransaction(t.ctx, id!)).toMatchObject({ isManual: true, import: null });
  });

  it('fails with NotFoundError for an unknown or malformed id', async () => {
    await expect(getTransaction(t.ctx, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(
      NotFoundError,
    );
    await expect(getTransaction(t.ctx, 'not-an-id')).rejects.toThrow(NotFoundError);
  });
});
