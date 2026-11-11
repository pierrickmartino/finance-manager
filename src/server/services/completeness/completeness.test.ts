import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { archiveAccount, createAccount, type Account, type AccountInput } from '../accounts';
import { createBank } from '../banks';
import { commitImport, previewImport, undoImport, type Import } from '../imports';
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
