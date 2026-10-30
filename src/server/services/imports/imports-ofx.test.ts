import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, getAccount, type Account, type AccountInput } from '../accounts';
import { createBank } from '../banks';
import { commitImport, listImportTransactions, previewImport, undoImport, type Import } from '.';

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
const CA_OCTOBER = 'credit-agricole/ca-eur-2025-10.ofx';

const CA_OVERLAP = 'credit-agricole/ca-eur-2025-10-15_2025-11-14-overlap.ofx';
const CA_CLOSED_TAGS = 'credit-agricole/ca-eur-2025-10-closed-tags.ofx';

function fixture(name: string): { fileName: string; content: Uint8Array } {
  return { fileName: path.basename(name), content: readFileSync(path.join(FIXTURES, name)) };
}

async function importFixture(account: Account, name: string): Promise<Import> {
  const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(name) });
  return commitImport(t.ctx, { previewId: preview.id });
}

/**
 * Stands in for Manual transactions (#13) until that service exists: inserts them directly, as
 * `is_manual` rows without Import or Fingerprint.
 */
async function insertManualTransactions(
  account: Account,
  rows: readonly (readonly [bookingDate: string, amountMinor: number])[],
): Promise<void> {
  for (const [bookingDate, amountMinor] of rows) {
    await t.ctx.db.query(
      `INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency,
         raw_description)
       VALUES ($1, true, $2, $3, $4, 'Manual')`,
      [account.id, bookingDate, amountMinor, account.currency],
    );
  }
}

async function caAccount(overrides: Partial<AccountInput> = {}): Promise<Account> {
  const bank = await createBank(t.ctx, { name: 'Crédit Agricole' });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'CA compte courant',
    currency: 'EUR',
    iban: 'FR7618206004006123456789050',
    kind: 'current',
    importFormat: 'ofx',
    openingBalanceMinor: 0,
    ...overrides,
  });
}

describe('preview an Import (Crédit Agricole OFX)', () => {
  it('reads every STMTTRN with its signed amount, FITID and Windows-1252 text', async () => {
    const account = await caAccount();

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OCTOBER) });

    expect(preview.entries.map((e) => [e.bookingDate, e.amountMinor, e.bankReference])).toEqual([
      ['2025-10-03', -3890, '2510030000001'],
      ['2025-10-06', -2460, '2510060000002'],
      ['2025-10-10', -12999, '2510100000003'],
      ['2025-10-14', 12999, '2510140000004'],
      ['2025-10-22', 50000, '2510220000005'],
      ['2025-10-27', -1500, '2510270000006'],
      ['2025-10-30', -6000, '2510300000007'],
    ]);
    expect(preview.entries[0]).toEqual({
      bookingDate: '2025-10-03',
      valueDate: null,
      amountMinor: -3890,
      currency: 'EUR',
      bankReference: '2510030000001',
      fingerprint: '2510030000001',
      nearDuplicates: [],
      rawDescription: 'PRLV SEPA ÉLECTRICITÉ EXEMPLE DISTRIBUTION ÉCHÉANCE 10/2025 RUM EX000123',
      counterpartyName: 'PRLV SEPA ÉLECTRICITÉ EXEMPLE DI',
      counterpartyIban: null,
      paymentReference: null,
      bundledDetails: null,
      runningBalanceMinor: null,
      status: 'new',
      nearDuplicates: [],
    });
    expect(preview.entries[1]!.rawDescription).toContain('CHÂTEAU');
    expect(preview.entries[5]!.counterpartyName).toBe('COTISATION OFFRE COMPTE À COMPOS');
    expect(preview.entries[5]!.rawDescription).toBe(
      'COTISATION OFFRE COMPTE À COMPOSER 10/2025 FRAIS 15,00 €',
    );
    expect(preview.statement).toMatchObject({
      from: '2025-10-01',
      to: '2025-10-31',
      currency: 'EUR',
      closingBalanceMinor: 134217,
    });
  });
});

describe('tolerant OFX reading', () => {
  it('reads a file whose leaf tags are closed exactly like the usual unclosed one', async () => {
    const account = await caAccount();

    const unclosed = await previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OCTOBER) });
    const closed = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(CA_CLOSED_TAGS),
    });

    expect(closed.entries).toHaveLength(7);
    expect(closed.entries).toEqual(unclosed.entries);
    expect(closed.statement).toEqual(unclosed.statement);
    expect(closed.proposedOpeningBalance).toEqual({ amountMinor: 98067, date: '2025-10-01' });
  });
});

describe('rejected OFX uploads', () => {
  it("rejects a file whose BANKID / BRANCHID / ACCTID are not the Account IBAN's", async () => {
    const account = await caAccount({ iban: 'FR6018206004009999999999950' });

    await expect(
      previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OCTOBER) }),
    ).rejects.toThrow(
      'This file is for bank 18206, branch 00400, account 61234567890, which is not this Account (IBAN FR6018206004009999999999950)',
    );
  });

  it('accepts the file on an Account without IBAN', async () => {
    const account = await caAccount({ iban: null });

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OCTOBER) });

    expect(preview.counts.new).toBe(7);
  });

  it('rejects a file in another Currency', async () => {
    const chf = await caAccount({ currency: 'CHF', iban: null });

    await expect(
      previewImport(t.ctx, { accountId: chf.id, ...fixture(CA_OCTOBER) }),
    ).rejects.toThrow('This file is in EUR, but this Account is in CHF');
  });

  it('rejects a file that is not OFX', async () => {
    const account = await caAccount();

    await expect(
      previewImport(t.ctx, { accountId: account.id, ...fixture('ubs/ubs-chf-2025-10.csv') }),
    ).rejects.toThrow(
      "This file doesn't match the Account's Import format (Crédit Agricole OFX): it is not an OFX file",
    );
  });
});

describe('damaged OFX files', () => {
  /** A minimal OFX statement around the given STMTTRN body. */
  function ofx(transaction: string): { fileName: string; content: Uint8Array } {
    const text = [
      'OFXHEADER:100',
      'DATA:OFXSGML',
      'CHARSET:1252',
      '',
      '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR',
      '<BANKTRANLIST><DTSTART>20251001<DTEND>20251031',
      `<STMTTRN>${transaction}</STMTTRN>`,
      '</BANKTRANLIST><LEDGERBAL><BALAMT>10.00<DTASOF>20251031</LEDGERBAL>',
      '</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
    ].join('\r\n');
    return { fileName: 'damaged.ofx', content: new TextEncoder().encode(text) };
  }

  it('names the transaction and the field that cannot be read', async () => {
    const account = await caAccount();

    await expect(
      previewImport(t.ctx, {
        accountId: account.id,
        ...ofx('<DTPOSTED>20251003<TRNAMT>-3O.00<FITID>X1<NAME>Shop'),
      }),
    ).rejects.toThrow('Transaction X1: TRNAMT "-3O.00" is not an amount');
    await expect(
      previewImport(t.ctx, {
        accountId: account.id,
        ...ofx('<DTPOSTED>2025-10-03<TRNAMT>-30.00<FITID>X2<NAME>Shop'),
      }),
    ).rejects.toThrow('Transaction X2: DTPOSTED "2025-10-03" is not a date');
    await expect(
      previewImport(t.ctx, {
        accountId: account.id,
        ...ofx('<TRNAMT>-30.00<FITID>X3<NAME>Shop'),
      }),
    ).rejects.toThrow('Transaction X3 has no DTPOSTED');
  });
});

describe('deduplicate by FITID (Crédit Agricole OFX)', () => {
  it('re-importing the same file adds nothing', async () => {
    const account = await caAccount();
    await importFixture(account, CA_OCTOBER);

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OCTOBER) });

    expect(preview.counts).toEqual({ total: 7, new: 0, duplicate: 7, nearDuplicate: 0 });
    expect(preview.reconciliation.status).toBe('ok');
    const again = await commitImport(t.ctx, { previewId: preview.id });
    expect(again).toMatchObject({ addedCount: 0, duplicateCount: 7 });
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(134217);
  });

  it('an overlapping export adds only the new FITIDs and its derived opening matches the history', async () => {
    const account = await caAccount();
    await importFixture(account, CA_OCTOBER);

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OVERLAP) });

    expect(preview.counts).toEqual({ total: 6, new: 3, duplicate: 3, nearDuplicate: 0 });
    expect(preview.entries.filter((e) => e.status === 'new').map((e) => e.bankReference)).toEqual([
      '2511040000008',
      '2511050000009',
      '2511120000010',
    ]);
    expect(preview.reconciliation).toEqual({
      status: 'ok',
      opening: { statementMinor: 91717, computedMinor: 91717, differenceMinor: 0 },
      closing: { statementMinor: 123332, computedMinor: 123332, differenceMinor: 0 },
      runningBalanceBreaks: [],
    });
    await commitImport(t.ctx, { previewId: preview.id });
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(123332);
  });
});

describe('derived opening balance (Crédit Agricole OFX)', () => {
  it('derives the opening balance from LEDGERBAL and proposes it on an Account with no history', async () => {
    const account = await caAccount();

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OCTOBER) });

    // LEDGERBAL 1342.17 − the file's +361.50 = 980.67
    expect(preview.statement.openingBalanceMinor).toBe(98067);
    expect(preview.isOpeningBalanceDerived).toBe(true);
    expect(preview.proposedOpeningBalance).toEqual({ amountMinor: 98067, date: '2025-10-01' });
    expect(preview.reconciliation).toEqual({
      status: 'ok',
      opening: null,
      closing: { statementMinor: 134217, computedMinor: 134217, differenceMinor: 0 },
      runningBalanceBreaks: [],
    });

    const committed = await commitImport(t.ctx, { previewId: preview.id });

    expect(committed).toMatchObject({
      importFormat: 'ofx',
      statementFrom: '2025-10-01',
      statementTo: '2025-10-31',
      openingBalanceMinor: 98067,
      closingBalanceMinor: 134217,
      addedCount: 7,
      reconciliationStatus: 'ok',
    });
    expect(await listImportTransactions(t.ctx, committed.id)).toHaveLength(7);
    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      openingBalanceMinor: 98067,
      openingDate: '2025-10-01',
      balanceMinor: 134217,
    });
  });

  it('undoing the Import restores the opening balance its derived opening balance replaced', async () => {
    const account = await caAccount();
    const before = await getAccount(t.ctx, account.id);

    const committed = await importFixture(account, CA_OCTOBER);
    await undoImport(t.ctx, committed.id);

    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      openingBalanceMinor: before.openingBalanceMinor,
      openingDate: before.openingDate,
    });
  });

  it('checks the derived opening balance against Manual history and passes when it agrees', async () => {
    const account = await caAccount();
    // 1500.00 − 400.00 − 119.33 = 980.67 at the end of 2025-09-30
    await insertManualTransactions(account, [
      ['2021-03-01', 150000],
      ['2023-06-15', -40000],
      ['2025-09-20', -11933],
    ]);

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OCTOBER) });

    expect(preview.proposedOpeningBalance).toBeNull();
    expect(preview.reconciliation).toEqual({
      status: 'ok',
      opening: { statementMinor: 98067, computedMinor: 98067, differenceMinor: 0 },
      closing: { statementMinor: 134217, computedMinor: 134217, differenceMinor: 0 },
      runningBalanceBreaks: [],
    });
  });

  it('warns when the Manual history disagrees with the derived opening balance', async () => {
    const account = await caAccount();
    // 1500.00 − 400.00 − 100.00 = 1000.00, 19.33 more than the file implies
    await insertManualTransactions(account, [
      ['2021-03-01', 150000],
      ['2023-06-15', -40000],
      ['2025-09-20', -10000],
    ]);

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(CA_OCTOBER) });

    expect(preview.proposedOpeningBalance).toBeNull();
    expect(preview.reconciliation).toEqual({
      status: 'mismatch',
      opening: { statementMinor: 98067, computedMinor: 100000, differenceMinor: 1933 },
      closing: { statementMinor: 134217, computedMinor: 136150, differenceMinor: 1933 },
      runningBalanceBreaks: [],
    });
  });
});
