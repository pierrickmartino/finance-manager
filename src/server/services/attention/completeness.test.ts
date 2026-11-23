import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, type Account, type AccountInput } from '../accounts';
import { createBank } from '../banks';
import { commitImport, previewImport } from '../imports';
import { createManualTransaction, updateManualTransaction } from '../transactions/manual';
import { listAttentionItems, markAttentionSeen, type AttentionItem } from '.';

const t = setupTestDatabase();

const TODAY = '2025-11-20';

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
/** A reconciled statement: its closing balance matches its Transactions, 1 to 31 Oct 2025. */
const BCGE_OCTOBER = 'bcge/bcge-chf-2025-10.xml';

interface ImportFile {
  fileName: string;
  content: Uint8Array;
}

function fixture(name: string): ImportFile {
  return { fileName: path.basename(name), content: readFileSync(path.join(FIXTURES, name)) };
}

/** A CHF CAMT.053 statement for `account` covering `from` to `to`, with one booked entry. */
function periodFile(account: Account, from: string, to: string): ImportFile {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <FrToDt><FrDtTm>${from}T00:00:00</FrDtTm><ToDtTm>${to}T23:59:59</ToDtTm></FrToDt>
    <Acct>${account.iban ? `<Id><IBAN>${account.iban}</IBAN></Id>` : ''}<Ccy>CHF</Ccy></Acct>
    <Ntry>
      <Amt Ccy="CHF">1.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
      <Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><DtTm>${from}T10:00:00</DtTm></BookgDt>
      <AcctSvcrRef>REF-${from}</AcctSvcrRef>
      <AddtlNtryInf>Paiement</AddtlNtryInf>
    </Ntry>
  </Stmt></BkToCstmrStmt>
</Document>`;
  return { fileName: 'synthetic.xml', content: new TextEncoder().encode(xml) };
}

async function importFile(account: Account, file: ImportFile): Promise<void> {
  const preview = await previewImport(t.ctx, { accountId: account.id, ...file });
  await commitImport(t.ctx, { previewId: preview.id });
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

const SAVINGS = { name: 'BCGE savings', iban: 'CH6900235235123456010' };

/** Imported Transactions are Unclassified too: only the Completeness items, in order. */
async function completenessItems(today = TODAY): Promise<AttentionItem[]> {
  const items = await listAttentionItems(t.ctx, { today });
  return items.filter((item) => item.kind === 'completeness');
}

describe('Completeness Attention items', () => {
  it('lists one item per failing Account with all its problems, linking to it; none for one that passes', async () => {
    const failing = await bcgeAccount();
    const passing = await bcgeAccount(SAVINGS);
    await importFile(failing, periodFile(failing, '2025-08-01', '2025-08-31'));
    await importFile(failing, periodFile(failing, '2025-09-02', '2025-09-30'));
    await importFile(passing, periodFile(passing, '2025-10-01', '2025-11-15'));

    expect(await completenessItems()).toEqual([
      {
        kind: 'completeness',
        subject: failing.id,
        accountName: 'BCGE current',
        currency: 'CHF',
        dataEnd: '2025-09-30',
        problems: [{ kind: 'gap', from: '2025-09-01', to: '2025-09-01' }, { kind: 'stale' }],
        href: `/accounts/${failing.id}`,
        tone: 'warning',
        key: JSON.stringify(['completeness', failing.id]),
        unread: true,
      },
    ]);
  });

  it('lists an Account with an Import format and no Import yet', async () => {
    const account = await bcgeAccount();

    expect(await completenessItems()).toMatchObject([
      { subject: account.id, dataEnd: null, problems: [{ kind: 'never_imported' }] },
    ]);
  });

  it('links an Account whose only problem is a mismatch to Accounts, and to the Account once it has another', async () => {
    const account = await bcgeAccount();
    await importFile(account, fixture(BCGE_OCTOBER));
    await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-10-20',
      amountMinor: -450,
      description: 'Coffee',
    });

    expect(await completenessItems()).toMatchObject([
      { problems: [{ kind: 'mismatch' }], href: '/accounts' },
    ]);
    // Weeks later the Account is Stale as well: fixed on the Account.
    expect(await completenessItems('2025-12-31')).toMatchObject([
      { problems: [{ kind: 'mismatch' }, { kind: 'stale' }], href: `/accounts/${account.id}` },
    ]);
  });

  it("follows the Completeness check's severity order, after FX rates and before Unclassified", async () => {
    const stale = await bcgeAccount({ name: 'BCGE old', iban: null });
    const gapped = await bcgeAccount(SAVINGS);
    const mismatched = await bcgeAccount();
    await importFile(stale, periodFile(stale, '2025-08-01', '2025-08-31'));
    await importFile(gapped, periodFile(gapped, '2025-09-01', '2025-09-30'));
    await importFile(gapped, periodFile(gapped, '2025-10-15', '2025-11-15'));
    await importFile(mismatched, fixture(BCGE_OCTOBER));
    await createManualTransaction(t.ctx, {
      accountId: mismatched.id,
      bookingDate: '2025-10-20',
      amountMinor: -450,
      description: 'Coffee',
    });

    const items = await listAttentionItems(t.ctx, { today: TODAY });

    // No FX rates were ever fetched: they are Stale.
    expect(items.map((item) => [item.kind, item.subject])).toEqual([
      ['fx-rates', null],
      ['completeness', mismatched.id],
      ['completeness', gapped.id],
      ['completeness', stale.id],
      ['unclassified', null],
    ]);
  });

  describe('read and unread', () => {
    async function unread(today = TODAY) {
      const items = await completenessItems(today);
      return items.map((item) => ({ subject: item.subject, unread: item.unread }));
    }

    it('marks the item unread when an Import reveals a new Gap', async () => {
      const account = await bcgeAccount();
      await importFile(account, periodFile(account, '2025-08-01', '2025-08-31'));
      await importFile(account, periodFile(account, '2025-09-05', '2025-09-30'));
      await markAttentionSeen(t.ctx, { today: TODAY });
      expect(await unread()).toEqual([{ subject: account.id, unread: false }]);

      await importFile(account, periodFile(account, '2025-10-10', '2025-11-15'));

      // One Gap seen, one new; and no longer Stale. The new Gap is news.
      expect(await unread()).toEqual([{ subject: account.id, unread: true }]);
    });

    it('marks the item unread when editing a Manual transaction causes a mismatch', async () => {
      const account = await bcgeAccount();
      await importFile(account, fixture(BCGE_OCTOBER));
      // Stale only once today is far enough past the end of October.
      const later = '2025-12-31';
      const coffee = await createManualTransaction(t.ctx, {
        accountId: account.id,
        bookingDate: '2025-11-03',
        amountMinor: -450,
        description: 'Coffee',
      });
      await markAttentionSeen(t.ctx, { today: later });
      expect(await unread(later)).toEqual([{ subject: account.id, unread: false }]);

      await updateManualTransaction(t.ctx, coffee.id, {
        bookingDate: '2025-10-20',
        amountMinor: -450,
        description: 'Coffee',
      });

      expect(await unread(later)).toEqual([{ subject: account.id, unread: true }]);
    });

    it('marks the item unread when an Account with a Gap goes Stale', async () => {
      const account = await bcgeAccount();
      await importFile(account, periodFile(account, '2025-09-01', '2025-09-30'));
      await importFile(account, periodFile(account, '2025-10-05', '2025-10-31'));
      await markAttentionSeen(t.ctx, { today: TODAY });
      expect(await unread()).toEqual([{ subject: account.id, unread: false }]);

      expect(await unread('2025-12-31')).toEqual([{ subject: account.id, unread: true }]);
    });

    it('keeps the item read when one of two Gaps is filled by a Manual transaction', async () => {
      const account = await bcgeAccount();
      await importFile(account, periodFile(account, '2025-08-01', '2025-08-31'));
      await importFile(account, periodFile(account, '2025-09-05', '2025-09-30'));
      await importFile(account, periodFile(account, '2025-10-05', '2025-11-15'));
      await markAttentionSeen(t.ctx, { today: TODAY });

      await createManualTransaction(t.ctx, {
        accountId: account.id,
        bookingDate: '2025-09-02',
        amountMinor: -500,
        description: 'Cash withdrawal',
      });

      expect(await completenessItems()).toMatchObject([
        { problems: [{ kind: 'gap', from: '2025-10-01', to: '2025-10-04' }], unread: false },
      ]);
    });

    it('keeps a Stale item read when a later Import leaves it Stale', async () => {
      const account = await bcgeAccount();
      await importFile(account, periodFile(account, '2025-08-01', '2025-08-31'));
      await markAttentionSeen(t.ctx, { today: TODAY });

      await importFile(account, periodFile(account, '2025-09-01', '2025-09-30'));

      expect(await completenessItems()).toMatchObject([
        { dataEnd: '2025-09-30', problems: [{ kind: 'stale' }], unread: false },
      ]);
    });

    it('removes the item once every problem is fixed, and marks it unread when one comes back', async () => {
      const account = await bcgeAccount();
      await importFile(account, periodFile(account, '2025-09-01', '2025-09-30'));
      await importFile(account, periodFile(account, '2025-10-05', '2025-11-15'));
      await markAttentionSeen(t.ctx, { today: TODAY });

      await importFile(account, periodFile(account, '2025-10-01', '2025-10-04'));
      expect(await unread()).toEqual([]);

      expect(await unread('2025-12-31')).toEqual([{ subject: account.id, unread: true }]);
    });
  });
});
