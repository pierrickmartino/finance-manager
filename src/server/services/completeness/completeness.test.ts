import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import {
  archiveAccount,
  createAccount,
  updateAccount,
  type Account,
  type AccountInput,
} from '../accounts';
import { createBank } from '../banks';
import { recordBalanceSnapshot } from '../balance-snapshots';
import { commitImport, previewImport, undoImport, type Import } from '../imports';
import { createManualTransaction, updateManualTransaction } from '../transactions/manual';
import { checkCompleteness } from '.';

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
const BCGE_OCTOBER = 'bcge/bcge-chf-2025-10.xml';
const BCGE_NOVEMBER = 'bcge/bcge-chf-2025-11.xml';

function fixture(name: string): { fileName: string; content: Uint8Array } {
  return { fileName: path.basename(name), content: readFileSync(path.join(FIXTURES, name)) };
}

async function importFile(
  account: Account,
  file: { fileName: string; content: Uint8Array },
): Promise<Import> {
  const preview = await previewImport(t.ctx, { accountId: account.id, ...file });
  return commitImport(t.ctx, { previewId: preview.id });
}

interface Booking {
  date: string;
  /** Debit, in CHF, as the file writes it. */
  amount: string;
}

/**
 * A minimal CHF CAMT.053 statement for `account` with the given booked entries and, when given,
 * a statement period (`FrToDt`). Without one the Import covers its first to last Transaction date.
 */
function camtFile(
  account: Account,
  bookings: Booking[],
  period?: { from: string; to: string },
): { fileName: string; content: Uint8Array } {
  const frToDt = period
    ? `<FrToDt><FrDtTm>${period.from}T00:00:00</FrDtTm><ToDtTm>${period.to}T23:59:59</ToDtTm></FrToDt>`
    : '';
  const entries = bookings.map(
    (booking, index) => `<Ntry>
      <Amt Ccy="CHF">${booking.amount}</Amt><CdtDbtInd>DBIT</CdtDbtInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><DtTm>${booking.date}T10:00:00</DtTm></BookgDt>
      <AcctSvcrRef>REF-${booking.date}-${index}</AcctSvcrRef>
      <AddtlNtryInf>Paiement</AddtlNtryInf>
    </Ntry>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    ${frToDt}
    <Acct><Id><IBAN>${account.iban}</IBAN></Id><Ccy>CHF</Ccy></Acct>
    ${entries.join('\n')}
  </Stmt></BkToCstmrStmt>
</Document>`;
  return { fileName: 'synthetic.xml', content: new TextEncoder().encode(xml) };
}

async function bcgeAccount(overrides: Partial<AccountInput> = {}): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `BCGE ${overrides.name ?? ''}`.trim() });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'BCGE current',
    currency: 'CHF',
    iban: 'CH3400788000050012345',
    kind: 'current',
    importFormat: 'camt053',
    openingBalanceMinor: 0,
    ...overrides,
  });
}

describe('freshness', () => {
  it("ends an Account's data on its latest Import's statement end and counts the days since", async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));

    const entries = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entries).toEqual([
      {
        account: { id: account.id, name: 'BCGE current', bankName: 'BCGE', currency: 'CHF' },
        dataEnd: '2025-10-31',
        daysSince: 10,
        isFreshnessChecked: true,
        problems: [],
      },
    ]);
  });

  it('falls back to the latest Transaction date when the file states no statement period', async () => {
    const account = await bcgeAccount();
    await importFile(
      account,
      camtFile(account, [
        { date: '2025-12-03', amount: '10.00' },
        { date: '2025-12-19', amount: '12.50' },
      ]),
    );

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-12-31' });

    expect(entry).toMatchObject({ dataEnd: '2025-12-19', daysSince: 12, problems: [] });
  });

  it('ignores an undone Import, so the data ends where the Imports still standing end', async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));
    const november = await importFile(account, fixture(BCGE_NOVEMBER));
    await undoImport(t.ctx, november.id);

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-12-10' });

    expect(entry).toMatchObject({ dataEnd: '2025-10-31', daysSince: 40 });
  });

  it('leaves out archived Accounts and manual-only Accounts', async () => {
    const checked = await bcgeAccount();
    const archived = await bcgeAccount({ name: 'BCGE old', iban: null });
    await archiveAccount(t.ctx, archived.id);
    await bcgeAccount({ name: 'BCGE cash', iban: null, importFormat: null });

    const entries = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entries.map((entry) => entry.account.id)).toEqual([checked.id]);
  });

  it('flags an Account with an Import format and no committed Import: "No Import yet"', async () => {
    const neverImported = await bcgeAccount({ iban: null });
    const allUndone = await bcgeAccount({ name: 'BCGE savings' });
    const october = await importFile(allUndone, fixture(BCGE_OCTOBER));
    await undoImport(t.ctx, october.id);

    const entries = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entries).toEqual([
      expect.objectContaining({
        account: expect.objectContaining({ id: neverImported.id }),
        dataEnd: null,
        daysSince: null,
        problems: [{ kind: 'never_imported' }],
      }),
      expect.objectContaining({
        account: expect.objectContaining({ id: allUndone.id }),
        dataEnd: null,
        daysSince: null,
        problems: [{ kind: 'never_imported' }],
      }),
    ]);
  });

  it('ignores an Import with no statement period and no Transactions: it covers nothing', async () => {
    const covered = await bcgeAccount();
    await importFile(covered, fixture(BCGE_OCTOBER));
    await importFile(covered, camtFile(covered, []));
    const uncovered = await bcgeAccount({ name: 'BCGE savings', iban: 'CH6900235235123456010' });
    await importFile(uncovered, camtFile(uncovered, []));

    const entries = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entries).toEqual([
      // Imported, but nothing covered: no data end, so Stale rather than "No Import yet".
      expect.objectContaining({
        account: expect.objectContaining({ id: uncovered.id }),
        dataEnd: null,
        daysSince: null,
        problems: [{ kind: 'stale' }],
      }),
      expect.objectContaining({
        account: expect.objectContaining({ id: covered.id }),
        dataEnd: '2025-10-31',
        daysSince: 10,
        problems: [],
      }),
    ]);
  });

  it('is Stale when the data ends more than 40 days before today: 40 is current, 41 is Stale', async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));

    const [fortyDays] = await checkCompleteness(t.ctx, { today: '2025-12-10' });
    const [fortyOneDays] = await checkCompleteness(t.ctx, { today: '2025-12-11' });

    expect(fortyDays).toMatchObject({ daysSince: 40, problems: [] });
    expect(fortyOneDays).toMatchObject({ daysSince: 41, problems: [{ kind: 'stale' }] });
  });
});

describe('order', () => {
  it('lists Accounts with problems first, then healthy ones in Accounts-list order', async () => {
    const healthy = await bcgeAccount();
    const stale = await bcgeAccount({ name: 'BCGE savings', iban: 'CH6900235235123456010' });
    const neverImported = await bcgeAccount({ name: 'BCGE spare', iban: null });
    await importFile(healthy, fixture(BCGE_OCTOBER));
    await importFile(
      stale,
      camtFile(stale, [{ date: '2025-09-12', amount: '5.00' }], {
        from: '2025-09-01',
        to: '2025-09-30',
      }),
    );

    const entries = await checkCompleteness(t.ctx, { today: '2025-11-20' });

    expect(entries.map((entry) => [entry.account.id, entry.problems])).toEqual([
      [stale.id, [{ kind: 'stale' }]],
      [neverImported.id, [{ kind: 'never_imported' }]],
      [healthy.id, []],
    ]);
  });
});

describe('mismatch', () => {
  it('flags a Manual transaction edited into a reconciled Import, with the difference and the statement end', async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));
    const coffee = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-11-03',
      amountMinor: -450,
      description: 'Coffee',
    });

    const [before] = await checkCompleteness(t.ctx, { today: '2025-11-10' });
    await updateManualTransaction(t.ctx, coffee.id, {
      bookingDate: '2025-10-20',
      amountMinor: -450,
      description: 'Coffee',
    });
    const [after] = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(before).toMatchObject({ problems: [] });
    expect(after).toMatchObject({
      problems: [{ kind: 'mismatch', differenceMinor: -450, statementDate: '2025-10-31' }],
    });
  });

  it('has no mismatch on a reconciled Import', async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entry).toMatchObject({ problems: [] });
  });

  it('compares a Balance snapshot later than the last Import instead of its closing balance', async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));
    await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-11-04',
      amountMinor: -2_000,
      description: 'Groceries',
    });
    // The October Import closes at CHF 16'908.15; minus the CHF 20 Manual transaction.
    await recordBalanceSnapshot(t.ctx, {
      accountId: account.id,
      date: '2025-11-05',
      balanceMinor: 1_688_815,
    });
    const [matching] = await checkCompleteness(t.ctx, { today: '2025-11-10' });
    await recordBalanceSnapshot(t.ctx, {
      accountId: account.id,
      date: '2025-11-07',
      balanceMinor: 1_690_815,
    });
    const [drifting] = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(matching).toMatchObject({ problems: [] });
    expect(drifting).toMatchObject({
      problems: [{ kind: 'mismatch', differenceMinor: -2_000, statementDate: '2025-11-07' }],
    });
  });

  it("compares the Import's closing balance, not a Balance snapshot on the same date", async () => {
    const account = await bcgeAccount();
    // The October Import closes at CHF 16'908.15 on 2025-10-31, as the Transactions add up to.
    await importFile(account, fixture(BCGE_OCTOBER));
    await recordBalanceSnapshot(t.ctx, {
      accountId: account.id,
      date: '2025-10-31',
      balanceMinor: 1_690_000,
    });

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entry).toMatchObject({ problems: [] });
  });

  it('falls back to the newest older Import that states a closing balance', async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));
    // No balances in the file: this newer Import states no closing balance.
    await importFile(account, periodFile(account, '2025-11-01', '2025-11-07'));
    await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-10-20',
      amountMinor: -450,
      description: 'Coffee',
    });

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entry).toMatchObject({
      problems: [{ kind: 'mismatch', differenceMinor: -450, statementDate: '2025-10-31' }],
    });
  });

  it("still checks an Import's closing balance after the Account's Import format is removed", async () => {
    const account = await bcgeAccount({ name: 'BCGE savings' });
    // A statement with no entries, opening and closing at zero: the Account has no Transactions,
    // so its Import format can still be removed afterwards.
    await importFile(account, emptyStatement(account, '2025-10-01', '2025-10-31'));
    await updateAccount(t.ctx, account.id, { ...accountInputOf(account), importFormat: null });
    await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-10-15',
      amountMinor: -300,
      description: 'Fee',
    });

    const entries = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entries).toEqual([
      {
        account: {
          id: account.id,
          name: 'BCGE savings',
          bankName: 'BCGE BCGE savings',
          currency: 'CHF',
        },
        dataEnd: null,
        daysSince: null,
        isFreshnessChecked: false,
        problems: [{ kind: 'mismatch', differenceMinor: -300, statementDate: '2025-10-31' }],
      },
    ]);
  });

  it('lists a manual-only Account only when its Balance snapshot drifts, and never as Stale', async () => {
    const cash = await bcgeAccount({ name: 'BCGE cash', iban: null, importFormat: null });
    await createManualTransaction(t.ctx, {
      accountId: cash.id,
      bookingDate: '2025-06-02',
      amountMinor: 5_000,
      description: 'Cash withdrawal',
    });
    await recordBalanceSnapshot(t.ctx, {
      accountId: cash.id,
      date: '2025-06-30',
      balanceMinor: 5_000,
    });
    const whileMatching = await checkCompleteness(t.ctx, { today: '2025-11-10' });
    await recordBalanceSnapshot(t.ctx, {
      accountId: cash.id,
      date: '2025-07-31',
      balanceMinor: 4_250,
    });

    const entries = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(whileMatching).toEqual([]);
    expect(entries).toEqual([
      {
        account: { id: cash.id, name: 'BCGE cash', bankName: 'BCGE BCGE cash', currency: 'CHF' },
        dataEnd: null,
        daysSince: null,
        isFreshnessChecked: false,
        problems: [{ kind: 'mismatch', differenceMinor: 750, statementDate: '2025-07-31' }],
      },
    ]);
  });

  it('leaves out an Account tracked only by Balance snapshots and an archived Account', async () => {
    const loan = await bcgeAccount({ name: 'BCGE loan', iban: null, importFormat: null });
    await recordBalanceSnapshot(t.ctx, {
      accountId: loan.id,
      date: '2025-06-30',
      balanceMinor: -900_000,
    });
    const archived = await bcgeAccount({ name: 'BCGE old', iban: null, importFormat: null });
    await createManualTransaction(t.ctx, {
      accountId: archived.id,
      bookingDate: '2025-06-02',
      amountMinor: 5_000,
      description: 'Cash withdrawal',
    });
    await recordBalanceSnapshot(t.ctx, {
      accountId: archived.id,
      date: '2025-06-30',
      balanceMinor: 1,
    });
    await archiveAccount(t.ctx, archived.id);

    const entries = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entries).toEqual([]);
  });

  it('ranks a mismatch above every other problem, in its row and in the list', async () => {
    const neverImported = await bcgeAccount({ name: 'BCGE spare', iban: null });
    const staleAndMismatched = await bcgeAccount();
    await importFile(staleAndMismatched, fixture(BCGE_OCTOBER));
    await createManualTransaction(t.ctx, {
      accountId: staleAndMismatched.id,
      bookingDate: '2025-10-15',
      amountMinor: -100,
      description: 'Fee',
    });

    const entries = await checkCompleteness(t.ctx, { today: '2025-12-31' });

    expect(entries.map((entry) => [entry.account.id, entry.problems])).toEqual([
      [
        staleAndMismatched.id,
        [
          { kind: 'mismatch', differenceMinor: -100, statementDate: '2025-10-31' },
          { kind: 'stale' },
        ],
      ],
      [neverImported.id, [{ kind: 'never_imported' }]],
    ]);
  });
});

/** A CAMT file for `account` covering `from` to `to`, with one entry booked on `from`. */
/** A CHF CAMT.053 statement for `account` with no entries, opening and closing at zero. */
function emptyStatement(
  account: Account,
  from: string,
  to: string,
): { fileName: string; content: Uint8Array } {
  const balance = (code: string, date: string): string =>
    `<Bal><Tp><CdOrPrtry><Cd>${code}</Cd></CdOrPrtry></Tp><Amt Ccy="CHF">0.00</Amt>` +
    `<CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${date}</Dt></Dt></Bal>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <FrToDt><FrDtTm>${from}T00:00:00</FrDtTm><ToDtTm>${to}T23:59:59</ToDtTm></FrToDt>
    <Acct><Id><IBAN>${account.iban}</IBAN></Id><Ccy>CHF</Ccy></Acct>
    ${balance('OPBD', from)}
    ${balance('CLBD', to)}
  </Stmt></BkToCstmrStmt>
</Document>`;
  return { fileName: 'empty.xml', content: new TextEncoder().encode(xml) };
}

function accountInputOf(account: Account): AccountInput {
  return {
    bankId: account.bankId,
    name: account.name,
    currency: account.currency,
    iban: account.iban,
    kind: account.kind,
    importFormat: account.importFormat,
    openingBalanceMinor: account.openingBalanceMinor,
    openingDate: account.openingDate,
  };
}

function periodFile(
  account: Account,
  from: string,
  to: string,
): { fileName: string; content: Uint8Array } {
  return camtFile(account, [{ date: from, amount: '1.00' }], { from, to });
}

describe('gaps', () => {
  it('flags a one-day Gap between two Imports with its first and last day, ranked above Stale', async () => {
    const account = await bcgeAccount();
    await importFile(account, periodFile(account, '2025-09-01', '2025-09-30'));
    await importFile(account, periodFile(account, '2025-10-02', '2025-10-31'));

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-12-31' });

    expect(entry!.problems).toEqual([
      { kind: 'gap', from: '2025-10-01', to: '2025-10-01' },
      { kind: 'stale' },
    ]);
  });

  it('does not flag a span that holds a Manual transaction on that Account', async () => {
    const account = await bcgeAccount();
    await importFile(account, periodFile(account, '2025-09-01', '2025-09-30'));
    await importFile(account, periodFile(account, '2025-10-11', '2025-10-31'));
    await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-10-05',
      amountMinor: -500,
      description: 'Cash withdrawal',
    });

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-11-10' });

    expect(entry!.problems).toEqual([]);
  });

  it('flags no Gap between contiguous Imports', async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));
    await importFile(account, fixture(BCGE_NOVEMBER));

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-12-10' });

    expect(entry!.problems).toEqual([]);
  });

  it('flags no Gap between overlapping Imports, whatever order they were imported in', async () => {
    const account = await bcgeAccount();
    await importFile(account, periodFile(account, '2025-10-16', '2025-11-15'));
    await importFile(account, periodFile(account, '2025-09-01', '2025-10-31'));

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-11-20' });

    expect(entry!.problems).toEqual([]);
  });

  it("covers an Import with no statement period from its first to its last Transaction's date", async () => {
    const account = await bcgeAccount();
    await importFile(account, periodFile(account, '2025-09-01', '2025-09-30'));
    await importFile(
      account,
      camtFile(account, [
        { date: '2025-10-05', amount: '10.00' },
        { date: '2025-10-20', amount: '12.50' },
      ]),
    );
    await importFile(account, periodFile(account, '2025-10-21', '2025-11-30'));

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-12-10' });

    expect(entry!.problems).toEqual([{ kind: 'gap', from: '2025-10-01', to: '2025-10-04' }]);
  });

  it('turns the period of an undone Import between two others into a Gap', async () => {
    const account = await bcgeAccount();
    await importFile(account, periodFile(account, '2025-09-01', '2025-09-30'));
    const october = await importFile(account, periodFile(account, '2025-10-01', '2025-10-31'));
    await importFile(account, periodFile(account, '2025-11-01', '2025-11-30'));
    await undoImport(t.ctx, october.id);

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-12-10' });

    expect(entry!.problems).toEqual([{ kind: 'gap', from: '2025-10-01', to: '2025-10-31' }]);
  });

  it("flags every Gap across the Account's whole history, oldest first", async () => {
    const account = await bcgeAccount();
    await importFile(account, periodFile(account, '2025-11-01', '2025-11-30'));
    await importFile(account, periodFile(account, '2025-01-01', '2025-01-31'));
    await importFile(account, periodFile(account, '2025-06-01', '2025-06-30'));

    const [entry] = await checkCompleteness(t.ctx, { today: '2025-12-10' });

    expect(entry!.problems).toEqual([
      { kind: 'gap', from: '2025-02-01', to: '2025-05-31' },
      { kind: 'gap', from: '2025-07-01', to: '2025-10-31' },
    ]);
  });

  it('ranks an Account with a Gap above a Stale one, even when the Gap is its only problem', async () => {
    const stale = await bcgeAccount();
    const gapped = await bcgeAccount({ name: 'BCGE savings', iban: 'CH6900235235123456010' });
    await importFile(stale, periodFile(stale, '2025-09-01', '2025-09-30'));
    await importFile(gapped, periodFile(gapped, '2025-09-01', '2025-09-30'));
    await importFile(gapped, periodFile(gapped, '2025-10-15', '2025-11-30'));

    const entries = await checkCompleteness(t.ctx, { today: '2025-12-10' });

    expect(entries.map((entry) => [entry.account.id, entry.problems])).toEqual([
      [gapped.id, [{ kind: 'gap', from: '2025-10-01', to: '2025-10-14' }]],
      [stale.id, [{ kind: 'stale' }]],
    ]);
  });
});
