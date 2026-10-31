import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { backfillRates, convertToChf, type EcbRateSource } from '../fx';
import { ValidationError } from '../errors';
import { editClassification, getTransaction } from '../transactions';
import { createManualTransaction } from '../transactions/manual';
import { linkTransfer } from '../transfers';
import { exportTransactionsCsv } from '.';

const t = setupTestDatabase();

/** The whole export as one string. */
async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of chunks) text += chunk;
  return text;
}

/** A small RFC 4180 reader with `;` as the separator, independent of the writer. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ';') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) rows.push([...row, cell]);
  return rows;
}

const HEADER = [
  'Bank',
  'Account',
  'Account Currency',
  'Booking date',
  'Value date',
  'Amount',
  'CHF value',
  'Raw description',
  'Counterparty name',
  'Counterparty IBAN',
  'Payment reference',
  'Payee',
  'Category group',
  'Category group type',
  'Category',
  'Tags',
  'Notes',
  'Transfer Account',
  'Transfer Transaction id',
  'Source',
  'Transaction id',
];

async function account(bankName: string, name: string, currency = 'CHF'): Promise<Account> {
  const bank = await createBank(t.ctx, { name: bankName });
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
    { bookingDate: '2025-10-10', amountMinor: -1250, rawDescription: 'CARTE COOP', ...row },
  ]);
  return id!;
}

/** The export's data rows (header and BOM dropped). */
async function exportRows(
  filter?: Parameters<typeof exportTransactionsCsv>[1],
): Promise<string[][]> {
  const [, ...rows] = parseCsv((await collect(exportTransactionsCsv(t.ctx, filter))).slice(1));
  return rows;
}

describe('CSV export of Transactions', () => {
  it('starts with a UTF-8 BOM and the header row, columns in order', async () => {
    const text = await collect(exportTransactionsCsv(t.ctx));

    expect(text.startsWith('\uFEFF')).toBe(true);
    // Semicolon separated, as Excel with a Swiss or French list separator expects.
    expect(text.startsWith('\uFEFFBank;Account;Account Currency;Booking date;')).toBe(true);
    expect(parseCsv(text.slice(1))).toEqual([HEADER]);
  });

  it('writes one row per Transaction with its bank fields and classification', async () => {
    const ubs = await account('UBS', 'Compte courant');
    const id = await seedOne(ubs, {
      bookingDate: '2025-10-10',
      valueDate: '2025-10-11',
      amountMinor: -123456,
      rawDescription: 'CARTE COOP GENEVE',
      counterpartyName: 'Coop',
      counterpartyIban: 'CH9300762011623852957',
      paymentReference: 'RF18539007547034',
    });
    const group = await createCategoryGroup(t.ctx, { name: 'Courses', type: 'expense' });
    const category = await createCategory(t.ctx, { groupId: group.id, name: 'Alimentation' });
    await editClassification(t.ctx, id, {
      payeeName: 'Coop',
      categoryId: category.id,
      tagNames: ['vacances', 'famille'],
      notes: 'Pique-nique',
    });
    const { importId } = await getTransaction(t.ctx, id);

    expect(await exportRows()).toEqual([
      [
        'UBS',
        'Compte courant',
        'CHF',
        '2025-10-10',
        '2025-10-11',
        '-1234.56',
        '-1234.56',
        'CARTE COOP GENEVE',
        'Coop',
        'CH9300762011623852957',
        'RF18539007547034',
        'Coop',
        'Courses',
        'expense',
        'Alimentation',
        'famille; vacances',
        'Pique-nique',
        '',
        '',
        importId,
        id,
      ],
    ]);
  });

  it('values each Transaction in CHF at its booking-date rate, like the shared FX conversion', async () => {
    const source: EcbRateSource = {
      async fetchReferenceRates(request) {
        return [
          { date: '2025-10-09', perEur: { CHF: '0.9301' } },
          { date: '2025-10-10', perEur: { CHF: '0.9324' } },
        ].filter((day) => day.date >= request.from && day.date <= request.to);
      },
    };
    await backfillRates(t.ctx, source, { from: '2025-10-09', to: '2025-10-12' });
    const ca = await account('Crédit Agricole', 'Compte EUR', 'EUR');
    await seedTransactions(t.ctx.db, ca, [
      { bookingDate: '2020-01-02', amountMinor: -500 },
      { bookingDate: '2025-10-09', amountMinor: 100005 },
      { bookingDate: '2025-10-10', amountMinor: -123456 },
      { bookingDate: '2025-10-12', amountMinor: -1 },
    ]);

    const rows = await exportRows();

    expect(rows.map((row) => [row[3], row[5], row[6]])).toEqual([
      ['2020-01-02', '-5.00', ''], // before any rate: left empty, never 0
      ['2025-10-09', '1000.05', '930.15'], // 930.146505
      ['2025-10-10', '-1234.56', '-1151.10'], // -1151.103744
      ['2025-10-12', '-0.01', '-0.01'], // Sunday: Friday's rate, -0.009324 rounds away from 0
    ]);
    for (const row of rows.slice(1)) {
      const chf = await convertToChf(t.ctx, {
        amountMinor: Math.round(Number(row[5]) * 100),
        currency: 'EUR',
        date: row[3]!,
      });
      expect(Math.round(Number(row[6]) * 100)).toBe(chf.amountMinor);
    }
  });

  it('exports only the Transactions matching the list filters', async () => {
    const ubs = await account('UBS', 'Compte courant');
    const bcge = await account('BCGE', 'Épargne');
    await seedTransactions(t.ctx.db, ubs, [
      { bookingDate: '2025-09-30', amountMinor: -100, rawDescription: 'CAFÉ DU MARCHÉ' },
      { bookingDate: '2025-10-01', amountMinor: -200, rawDescription: 'Café du marché' },
      { bookingDate: '2025-10-02', amountMinor: -300, rawDescription: 'MIGROS' },
    ]);
    await seedTransactions(t.ctx.db, bcge, [
      { bookingDate: '2025-10-01', amountMinor: -400, rawDescription: 'CAFE DU MARCHE' },
    ]);

    const rows = await exportRows({
      accountId: ubs.id,
      from: '2025-10-01',
      text: 'cafe du marche',
    });

    expect(rows.map((row) => [row[1], row[3], row[7]])).toEqual([
      ['Compte courant', '2025-10-01', 'Café du marché'],
    ]);
  });

  it('refuses invalid filters before writing anything', () => {
    expect(() => exportTransactionsCsv(t.ctx, { from: '2025-10-02', to: '2025-10-01' })).toThrow(
      ValidationError,
    );
  });

  it('shows the other side of a Transfer on both of its Transactions', async () => {
    const ubs = await account('UBS', 'Compte courant');
    const bcge = await account('BCGE', 'Épargne');
    const out = await seedOne(ubs, { bookingDate: '2025-10-10', amountMinor: -200000 });
    const into = await seedOne(bcge, { bookingDate: '2025-10-11', amountMinor: 200000 });
    await linkTransfer(t.ctx, { transactionIds: [out, into] });

    const rows = await exportRows();

    expect(rows.map((row) => [row[20], row[17], row[18]])).toEqual([
      [out, 'BCGE · Épargne', into],
      [into, 'UBS · Compte courant', out],
    ]);
  });

  it('marks Manual transactions as manual in the Source column', async () => {
    const cler = await account('Cler', 'Compte Cler');
    const manual = await createManualTransaction(t.ctx, {
      accountId: cler.id,
      bookingDate: '2025-10-10',
      amountMinor: -4200,
      description: 'Loyer',
    });

    expect((await exportRows()).map((row) => [row[19], row[20]])).toEqual([['manual', manual.id]]);
  });

  it('escapes separators, quotes and line breaks in text cells', async () => {
    const ubs = await account('UBS', 'Compte; "principal"');
    await seedOne(ubs, {
      rawDescription: 'ORDRE; e-banking, "Loyer"\r\nOctobre',
      counterpartyName: 'Müller & Fils',
    });

    const text = await collect(exportTransactionsCsv(t.ctx));
    const [row] = parseCsv(text.slice(1)).slice(1);

    expect(text).toContain('"Compte; ""principal"""');
    expect(row![1]).toBe('Compte; "principal"');
    expect(row![7]).toBe('ORDRE; e-banking, "Loyer"\r\nOctobre');
    expect(row![8]).toBe('Müller & Fils');
  });

  it('neutralises text cells a spreadsheet would run as formulas, keeping amounts numeric', async () => {
    const ubs = await account('UBS', 'Compte courant');
    const id = await seedOne(ubs, {
      amountMinor: -5000,
      rawDescription: '=HYPERLINK("http://evil.example","x")',
      counterpartyName: '+41 22 000 00 00',
      paymentReference: '-2+3',
    });
    await editClassification(t.ctx, id, { notes: '@SUM(A1:A9)', payeeName: 'Coop' });

    const [row] = await exportRows();

    expect(row![5]).toBe('-50.00');
    expect(row![6]).toBe('-50.00');
    expect(row![7]).toBe(`'=HYPERLINK("http://evil.example","x")`);
    expect(row![8]).toBe(`'+41 22 000 00 00`);
    expect(row![10]).toBe(`'-2+3`);
    expect(row![16]).toBe(`'@SUM(A1:A9)`);
    expect(row![11]).toBe('Coop');
  });
});
