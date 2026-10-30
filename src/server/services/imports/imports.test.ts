import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import {
  createAccount,
  getAccount,
  updateAccount,
  type Account,
  type AccountInput,
} from '../accounts';
import { createBank } from '../banks';
import { listHistory } from '../history';
import {
  commitImport,
  discardImport,
  getImportPreview,
  listImports,
  listImportTransactions,
  previewImport,
  type Import,
} from '.';

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
const UBS_OCTOBER = 'ubs/ubs-chf-2025-10.csv';
const UBS_OVERLAP = 'ubs/ubs-chf-2025-10-16_2025-11-15-overlap.csv';
const UBS_MISSING_ROW = 'ubs/ubs-chf-2025-10-missing-row.csv';

function fixture(name: string): { fileName: string; content: Uint8Array } {
  return { fileName: path.basename(name), content: readFileSync(path.join(FIXTURES, name)) };
}

/** Previews and commits a fixture. */
async function importFixture(account: Account, name: string): Promise<Import> {
  const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(name) });
  return commitImport(t.ctx, { previewId: preview.id });
}

function accountInput(account: Account): AccountInput {
  const { bankId, name, currency, iban, kind, importFormat, openingBalanceMinor, openingDate } =
    account;
  return { bankId, name, currency, iban, kind, importFormat, openingBalanceMinor, openingDate };
}

async function ubsAccount(overrides: Partial<AccountInput> = {}): Promise<Account> {
  const bank = await createBank(t.ctx, { name: 'UBS' });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'UBS current',
    currency: 'CHF',
    iban: 'CH6900235235123456010',
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
    ...overrides,
  });
}

describe('preview an Import (UBS CSV)', () => {
  it('parses every booked row, oldest first, with its bank fields', async () => {
    const account = await ubsAccount();

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });

    expect(preview.statement).toEqual({
      from: '2025-10-01',
      to: '2025-10-31',
      currency: 'CHF',
      openingBalanceMinor: 845035,
      closingBalanceMinor: 1290305,
    });
    expect(preview.entries).toHaveLength(14);
    expect(preview.entries.map((entry) => entry.bankReference)).toEqual([
      '9930274TI0000101',
      '9930275TI0000102',
      '9930276TI0000103',
      '9930279TI0000104',
      '9930283TI0000105',
      '9930287TI0000106',
      '9930288TI0000107',
      '9930290TI0000108',
      '9930293TI0000109',
      '9930297TI0000110',
      '9930297TI0000111',
      '9930298TI0000112',
      '9930301TI0000113',
      '9930304TI0000114',
    ]);
    // Rent: a debit with a counterparty IBAN and a payment reason in Description3
    expect(preview.entries[0]).toMatchObject({
      bookingDate: '2025-10-01',
      valueDate: '2025-10-01',
      amountMinor: -215000,
      currency: 'CHF',
      bankReference: '9930274TI0000101',
      fingerprint: '9930274TI0000101',
      counterpartyName: 'Régie Exemple SA, Rue du Modèle 12, 1204 Genève',
      counterpartyIban: 'CH7809000000012345678',
      paymentReference: 'Loyer octobre 2025',
      runningBalanceMinor: 630035,
      status: 'new',
    });
    expect(preview.entries[0]!.rawDescription).toContain('Ordre permanent e-banking');
    expect(preview.entries[0]!.rawDescription).toContain('IBAN: CH78 0900 0000 0123 4567 8');
    // Card payment: booked a day after the purchase, no IBAN
    expect(preview.entries[1]).toMatchObject({
      bookingDate: '2025-10-02',
      valueDate: '2025-10-01',
      amountMinor: -8745,
      counterpartyName: 'Migros Exemple Plainpalais, 1205 Genève',
      counterpartyIban: null,
      paymentReference: null,
    });
    // Refund: a credit
    expect(preview.entries[7]).toMatchObject({
      bankReference: '9930290TI0000108',
      amountMinor: 8990,
    });
    // Salary: booking date before the value date
    expect(preview.entries[11]).toMatchObject({
      bookingDate: '2025-10-24',
      valueDate: '2025-10-25',
      amountMinor: 625000,
      counterpartyIban: 'CH0300700110000123456',
      paymentReference: 'Salaire octobre 2025',
    });
    expect(preview.counts).toEqual({ total: 14, new: 14, duplicate: 0, nearDuplicate: 0 });
  });
});

describe('reconcile an Import (UBS CSV)', () => {
  it('passes on a complete file and proposes its Solde initial on an Account with no history', async () => {
    const account = await ubsAccount();

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });

    expect(preview.reconciliation).toEqual({
      status: 'ok',
      opening: null,
      closing: { statementMinor: 1290305, computedMinor: 1290305, differenceMinor: 0 },
      runningBalanceBreaks: [],
    });
    expect(preview.proposedOpeningBalance).toEqual({ amountMinor: 845035, date: '2025-10-01' });
  });
});

describe('commit an Import (UBS CSV)', () => {
  it('saves the new Transactions, the opening balance and the Import, in one History Batch', async () => {
    const account = await ubsAccount();
    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });

    const committed = await commitImport(t.ctx, { previewId: preview.id });

    expect(committed).toMatchObject({
      accountId: account.id,
      fileName: 'ubs-chf-2025-10.csv',
      importFormat: 'ubs_csv',
      statementFrom: '2025-10-01',
      statementTo: '2025-10-31',
      openingBalanceMinor: 845035,
      closingBalanceMinor: 1290305,
      addedCount: 14,
      duplicateCount: 0,
      reconciliationStatus: 'ok',
      undoneAt: null,
    });
    expect(await listImports(t.ctx, account.id)).toEqual([committed]);

    const transactions = await listImportTransactions(t.ctx, committed.id);
    expect(transactions).toHaveLength(14);
    expect(transactions[0]).toEqual({
      id: expect.any(String),
      accountId: account.id,
      importId: committed.id,
      isManual: false,
      bookingDate: '2025-10-01',
      valueDate: '2025-10-01',
      amountMinor: -215000,
      currency: 'CHF',
      fingerprint: '9930274TI0000101',
      bankReference: '9930274TI0000101',
      rawDescription: expect.stringContaining('Loyer octobre 2025'),
      counterpartyName: 'Régie Exemple SA, Rue du Modèle 12, 1204 Genève',
      counterpartyIban: 'CH7809000000012345678',
      paymentReference: 'Loyer octobre 2025',
      bundledDetails: null,
      notes: null,
      lockedFields: [],
    });
    // Same-day rows keep the bank's order
    expect(transactions.slice(9, 12).map((tr) => tr.bankReference)).toEqual([
      '9930297TI0000110',
      '9930297TI0000111',
      '9930298TI0000112',
    ]);

    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      openingBalanceMinor: 845035,
      openingDate: '2025-10-01',
      balanceMinor: 1290305,
    });

    const batch = await listHistory(t.ctx, {
      batchId: (await listHistory(t.ctx, { entityId: committed.id }))[0]!.batchId,
    });
    expect(new Set(batch.map((entry) => `${entry.actorType}:${entry.actorId}`))).toEqual(
      new Set([`import:${committed.id}`]),
    );
    const entities = new Set(batch.map((entry) => `${entry.entityType}:${entry.entityId}`));
    expect(entities).toEqual(
      new Set([
        `import:${committed.id}`,
        `account:${account.id}`,
        ...transactions.map((tr) => `transaction:${tr.id}`),
      ]),
    );
  });
});

describe('deduplicate by Fingerprint (UBS CSV)', () => {
  it('re-importing the same file adds no Transaction', async () => {
    const account = await ubsAccount();
    await importFixture(account, UBS_OCTOBER);

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });
    expect(preview.counts).toEqual({ total: 14, new: 0, duplicate: 14, nearDuplicate: 0 });
    expect(preview.entries.every((entry) => entry.status === 'duplicate')).toBe(true);
    expect(preview.proposedOpeningBalance).toBeNull();
    expect(preview.reconciliation.status).toBe('ok');

    const again = await commitImport(t.ctx, { previewId: preview.id });
    expect(again).toMatchObject({ addedCount: 0, duplicateCount: 14, reconciliationStatus: 'ok' });
    expect(await listImportTransactions(t.ctx, again.id)).toEqual([]);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1290305);
  });

  it('an overlapping file adds only the new Transactions and reconciles with the history', async () => {
    const account = await ubsAccount();
    await importFixture(account, UBS_OCTOBER);

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OVERLAP) });

    expect(preview.counts).toEqual({ total: 12, new: 5, duplicate: 7, nearDuplicate: 0 });
    expect(preview.entries.filter((e) => e.status === 'new').map((e) => e.bankReference)).toEqual([
      '9930307TI0000115',
      '9930308TI0000116',
      '9930311TI0000117',
      '9930316TI0000118',
      '9930318TI0000119',
    ]);
    expect(preview.reconciliation).toEqual({
      status: 'ok',
      opening: { statementMinor: 701290, computedMinor: 701290, differenceMinor: 0 },
      closing: { statementMinor: 1049030, computedMinor: 1049030, differenceMinor: 0 },
      runningBalanceBreaks: [],
    });

    const committed = await commitImport(t.ctx, { previewId: preview.id });
    expect(committed).toMatchObject({ addedCount: 5, duplicateCount: 7 });
    expect((await listImportTransactions(t.ctx, committed.id)).map((tr) => tr.amountMinor)).toEqual(
      [-215000, -10230, -3870, -6490, -5685],
    );
    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      openingBalanceMinor: 845035,
      balanceMinor: 1049030,
    });
    expect((await listImports(t.ctx, account.id)).map((i) => i.fileName)).toEqual([
      'ubs-chf-2025-10-16_2025-11-15-overlap.csv',
      'ubs-chf-2025-10.csv',
    ]);
  });

  it('skips Transactions committed after the preview was made instead of adding them twice', async () => {
    const account = await ubsAccount();
    const first = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });
    const second = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });
    await commitImport(t.ctx, { previewId: first.id });

    const committed = await commitImport(t.ctx, { previewId: second.id });

    expect(committed).toMatchObject({ addedCount: 0, duplicateCount: 14 });
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1290305);
  });
});

describe('reconciliation failures (UBS CSV)', () => {
  it('a file with a removed row fails, and the running balance locates the gap', async () => {
    const account = await ubsAccount();

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(UBS_MISSING_ROW),
    });

    expect(preview.counts.new).toBe(13);
    expect(preview.reconciliation).toEqual({
      status: 'mismatch',
      opening: null,
      closing: { statementMinor: 1290305, computedMinor: 1296795, differenceMinor: 6490 },
      runningBalanceBreaks: [
        {
          bankReference: '9930290TI0000108',
          bookingDate: '2025-10-17',
          expectedMinor: 716770,
          statedMinor: 710280,
          differenceMinor: 6490,
          previous: { bankReference: '9930287TI0000106', bookingDate: '2025-10-14' },
        },
      ],
    });

    // A mismatch is a warning: the file can still be committed, and the Import says so
    const committed = await commitImport(t.ctx, { previewId: preview.id });
    expect(committed.reconciliationStatus).toBe('mismatch');
    expect((await listImports(t.ctx, account.id))[0]!.reconciliation).toEqual(
      preview.reconciliation,
    );
  });

  it('flags an opening balance that differs from the Account history', async () => {
    const account = await ubsAccount();
    await importFixture(account, UBS_OCTOBER);
    // The opening balance is edited after the October import: now 100.00 too high
    await updateAccount(t.ctx, account.id, {
      ...accountInput(await getAccount(t.ctx, account.id)),
      openingBalanceMinor: 855035,
    });

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OVERLAP) });

    expect(preview.reconciliation).toEqual({
      status: 'mismatch',
      opening: { statementMinor: 701290, computedMinor: 711290, differenceMinor: 10000 },
      closing: { statementMinor: 1049030, computedMinor: 1059030, differenceMinor: 10000 },
      runningBalanceBreaks: [],
    });
  });
});

describe('rejected uploads', () => {
  it("rejects a file that is not in the Account's Import format", async () => {
    const account = await ubsAccount();

    await expect(
      previewImport(t.ctx, { accountId: account.id, ...fixture('bcge/bcge-chf-2025-10.xml') }),
    ).rejects.toThrow("This file doesn't match the Account's Import format (UBS CSV)");
    await expect(
      previewImport(t.ctx, {
        accountId: account.id,
        fileName: 'binary.csv',
        content: new Uint8Array([0xff, 0xfe, 0x00]),
      }),
    ).rejects.toThrow("This file doesn't match the Account's Import format (UBS CSV)");
  });

  it("rejects a file whose IBAN is not the Account's", async () => {
    const account = await ubsAccount({ iban: 'CH3400788000050012345' });

    await expect(
      previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) }),
    ).rejects.toThrow(
      "This file is for IBAN CH6900235235123456010, but this Account's IBAN is CH3400788000050012345",
    );
  });

  it('rejects a file in another Currency, an Account without Import format, and an empty file', async () => {
    const eur = await ubsAccount({ currency: 'EUR' });
    await expect(
      previewImport(t.ctx, { accountId: eur.id, ...fixture(UBS_OCTOBER) }),
    ).rejects.toThrow('This file is in CHF, but this Account is in EUR');

    const cler = await createBank(t.ctx, { name: 'Cler' });
    const manual = await createAccount(t.ctx, {
      bankId: cler.id,
      name: 'Cler current',
      currency: 'CHF',
      kind: 'current',
      openingBalanceMinor: 0,
    });
    await expect(
      previewImport(t.ctx, { accountId: manual.id, ...fixture(UBS_OCTOBER) }),
    ).rejects.toThrow('This Account has no Import format');

    await expect(
      previewImport(t.ctx, { accountId: eur.id, fileName: 'empty.csv', content: new Uint8Array() }),
    ).rejects.toThrow('The file is empty');
  });

  it('saves nothing until committed, and nothing at all once discarded', async () => {
    const account = await ubsAccount();
    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });
    expect(await getImportPreview(t.ctx, preview.id)).toEqual(preview);
    expect(await listImports(t.ctx, account.id)).toEqual([]);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(0);

    await discardImport(t.ctx, preview.id);

    await expect(commitImport(t.ctx, { previewId: preview.id })).rejects.toThrow(
      'This Import preview no longer exists',
    );
    await expect(getImportPreview(t.ctx, preview.id)).rejects.toThrow('no longer exists');
    expect(await listImports(t.ctx, account.id)).toEqual([]);
    expect(await listHistory(t.ctx, { entityType: 'transaction' })).toEqual([]);
  });

  it('keeps the Account opening balance when the proposed one is declined', async () => {
    const account = await ubsAccount({ openingBalanceMinor: 100, openingDate: '2021-01-01' });
    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });

    await commitImport(t.ctx, { previewId: preview.id, acceptOpeningBalance: false });

    // 1.00 opening + the October Transactions (12903.05 − 8450.35)
    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      openingBalanceMinor: 100,
      openingDate: '2021-01-01',
      balanceMinor: 445370,
    });
  });
});

describe('an Account with Transactions', () => {
  it("can't change its Import format or Currency any more", async () => {
    const account = await ubsAccount();
    await importFixture(account, UBS_OCTOBER);
    const current = accountInput(await getAccount(t.ctx, account.id));

    await expect(
      updateAccount(t.ctx, account.id, { ...current, importFormat: 'camt053' }),
    ).rejects.toThrow(
      "The Import format and Currency can't change once the Account has Transactions",
    );
    await expect(updateAccount(t.ctx, account.id, { ...current, currency: 'EUR' })).rejects.toThrow(
      "can't change once the Account has Transactions",
    );
    // Other fields still can
    await expect(
      updateAccount(t.ctx, account.id, { ...current, name: 'UBS joint' }),
    ).resolves.toMatchObject({ name: 'UBS joint', importFormat: 'ubs_csv' });
  });

  it('refuses any change to the bank fields of an imported Transaction', async () => {
    const account = await ubsAccount();
    const committed = await importFixture(account, UBS_OCTOBER);
    const [first] = await listImportTransactions(t.ctx, committed.id);

    // No service edits bank fields yet; the database itself refuses it.
    await expect(
      t.ctx.db.query('UPDATE "transaction" SET amount_minor = 1 WHERE id = $1', [first!.id]),
    ).rejects.toThrow('The bank fields of an imported Transaction cannot change');
    await expect(
      t.ctx.db.query('UPDATE "transaction" SET notes = $2 WHERE id = $1', [first!.id, 'ok']),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});
