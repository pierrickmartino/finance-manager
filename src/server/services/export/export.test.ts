import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { editClassification, getTransaction } from '../transactions';
import { exportTransactionsCsv } from '.';

const t = setupTestDatabase();

/** The whole export as one string. */
async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of chunks) text += chunk;
  return text;
}

/** A small RFC 4180 reader, independent of the writer: rows of cells. */
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
    } else if (char === ',') {
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
async function exportRows(filter?: Parameters<typeof exportTransactionsCsv>[1]): Promise<string[][]> {
  const [, ...rows] = parseCsv((await collect(exportTransactionsCsv(t.ctx, filter))).slice(1));
  return rows;
}

describe('CSV export of Transactions', () => {
  it('starts with a UTF-8 BOM and the header row, columns in order', async () => {
    const text = await collect(exportTransactionsCsv(t.ctx));

    expect(text.startsWith('﻿')).toBe(true);
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
});
