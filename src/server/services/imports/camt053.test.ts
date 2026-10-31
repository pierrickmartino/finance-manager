import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, getAccount, type Account, type AccountInput } from '../accounts';
import { createBank } from '../banks';
import { commitImport, listImportTransactions, previewImport, type Import } from '.';

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
const BCGE_CHF_OCTOBER = 'bcge/bcge-chf-2025-10.xml';
const BCGE_CHF_NOVEMBER = 'bcge/bcge-chf-2025-11.xml';
const BCGE_CHF_TAMPERED = 'bcge/bcge-chf-2025-10-tampered.xml';
const BCGE_EUR_OCTOBER = 'bcge/bcge-eur-2025-10.xml';

function fixture(name: string): { fileName: string; content: Uint8Array } {
  return { fileName: path.basename(name), content: readFileSync(path.join(FIXTURES, name)) };
}

function xmlFile(xml: string): { fileName: string; content: Uint8Array } {
  return { fileName: 'synthetic.xml', content: new TextEncoder().encode(xml) };
}

async function importFixture(account: Account, name: string): Promise<Import> {
  const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(name) });
  return commitImport(t.ctx, { previewId: preview.id });
}

async function bcgeAccount(overrides: Partial<AccountInput> = {}): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `BCGE ${overrides.currency ?? 'CHF'}` });
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

describe('preview an Import (BCGE CAMT.053)', () => {
  it('reads every booked entry, oldest first, with signed amounts and its bank fields', async () => {
    const account = await bcgeAccount();

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(BCGE_CHF_OCTOBER),
    });

    expect(preview.statement).toEqual({
      from: '2025-10-01',
      to: '2025-10-31',
      currency: 'CHF',
      openingBalanceMinor: 1523040,
      closingBalanceMinor: 1690815,
    });
    expect(preview.entries.map((entry) => [entry.bookingDate, entry.amountMinor])).toEqual([
      ['2025-10-02', -118735],
      ['2025-10-05', -10000],
      ['2025-10-05', -10000],
      ['2025-10-08', -7240],
      ['2025-10-10', -200000],
      ['2025-10-15', 35000],
      ['2025-10-24', 480000],
      ['2025-10-31', -1250],
    ]);
    // A debit: the counterparty is the creditor
    expect(preview.entries[4]).toMatchObject({
      valueDate: '2025-10-10',
      currency: 'CHF',
      bankReference: 'BCGE20251010000342',
      fingerprint: 'BCGE20251010000342',
      counterpartyName: 'Alex Muster',
      counterpartyIban: 'CH6900235235123456010',
      paymentReference: 'Alimentation compte UBS',
      bundledDetails: null,
      runningBalanceMinor: null,
      status: 'new',
    });
    expect(preview.entries[4]!.rawDescription).toContain('Ordre e-banking');
    expect(preview.entries[4]!.rawDescription).toContain('Alimentation compte UBS');
    // A credit: the counterparty is the debtor; booked before its value date
    expect(preview.entries[6]).toMatchObject({
      bookingDate: '2025-10-24',
      valueDate: '2025-10-25',
      counterpartyName: 'Employeur Deux Exemple SA',
      counterpartyIban: 'CH4700700110000654321',
      paymentReference: 'Salaire octobre 2025',
    });
    // A card entry: no related parties, no remittance text
    expect(preview.entries[3]).toMatchObject({
      bankReference: null,
      counterpartyName: null,
      counterpartyIban: null,
      paymentReference: null,
      rawDescription: 'Achat Debit Mastercard Boulangerie Exemple Genève',
    });
    expect(preview.counts).toEqual({ total: 8, new: 8, duplicate: 0, nearDuplicate: 0 });
  });
});

describe('a bundled entry (BCGE CAMT.053)', () => {
  it('is one Transaction for the entry total, with every payment detail kept', async () => {
    const account = await bcgeAccount();

    const committed = await importFixture(account, BCGE_CHF_OCTOBER);

    const [bundled] = await listImportTransactions(t.ctx, committed.id);
    expect(bundled).toMatchObject({
      bookingDate: '2025-10-02',
      amountMinor: -118735,
      bankReference: 'BCGE20251002000117',
      counterpartyName: null,
      counterpartyIban: null,
      paymentReference: null,
      bundledDetails: [
        {
          amountMinor: -14285,
          counterpartyName: 'Services Industriels Exemple',
          counterpartyIban: 'CH2000788000099887766',
          paymentReference: 'Facture électricité 09/2025',
        },
        {
          amountMinor: -38950,
          counterpartyName: 'Assurance Ménage Exemple SA',
          counterpartyIban: 'CH5300700110000777888',
          paymentReference: 'Prime ménage RC 2025-2026',
        },
        {
          amountMinor: -65500,
          counterpartyName: 'Garderie Les Exemples',
          counterpartyIban: 'CH1509000000055667788',
          paymentReference: 'Garderie octobre 2025 - enfant A. et enfant B.',
        },
      ],
    });
    // The details' text is searchable on the Transaction
    expect(bundled!.rawDescription).toContain('Ordre groupé e-banking (3 paiements)');
    expect(bundled!.rawDescription).toContain('Garderie octobre 2025');
  });
});

describe('Fingerprints (BCGE CAMT.053)', () => {
  it('entries without a reference get hash Fingerprints, and identical same-day ones are both kept', async () => {
    const account = await bcgeAccount();

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(BCGE_CHF_OCTOBER),
    });

    const fingerprints = preview.entries.map((entry) => entry.fingerprint);
    expect(fingerprints.filter((fp) => fp.startsWith('BCGE'))).toHaveLength(5);
    const [first, second, card] = preview.entries.slice(1, 4).map((entry) => entry.fingerprint);
    expect(first).toMatch(/^h:[0-9a-f]{64}#0$/);
    expect(second).toBe(first!.replace(/#0$/, '#1'));
    expect(card).toMatch(/^h:[0-9a-f]{64}#0$/);
    expect(new Set(fingerprints).size).toBe(8);

    const committed = await commitImport(t.ctx, { previewId: preview.id });
    expect(committed.addedCount).toBe(8);
    const withdrawals = (await listImportTransactions(t.ctx, committed.id)).filter(
      (tr) => tr.bookingDate === '2025-10-05',
    );
    expect(withdrawals.map((tr) => [tr.amountMinor, tr.fingerprint])).toEqual([
      [-10000, first],
      [-10000, second],
    ]);
  });

  it('re-importing the same file adds nothing, references and hashes alike', async () => {
    const account = await bcgeAccount();
    await importFixture(account, BCGE_CHF_OCTOBER);

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(BCGE_CHF_OCTOBER),
    });
    expect(preview.counts).toEqual({ total: 8, new: 0, duplicate: 8, nearDuplicate: 0 });
    expect(preview.reconciliation.status).toBe('ok');

    const again = await commitImport(t.ctx, { previewId: preview.id });
    expect(again).toMatchObject({ addedCount: 0, duplicateCount: 8 });
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1690815);
  });
});

describe('reconcile an Import (BCGE CAMT.053)', () => {
  it('passes against OPBD and CLBD, and proposes OPBD on an Account with no history', async () => {
    const account = await bcgeAccount();

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(BCGE_CHF_OCTOBER),
    });

    expect(preview.reconciliation).toEqual({
      status: 'ok',
      opening: null,
      closing: { statementMinor: 1690815, computedMinor: 1690815, differenceMinor: 0 },
      runningBalanceBreaks: [],
    });
    expect(preview.proposedOpeningBalance).toEqual({ amountMinor: 1523040, date: '2025-10-01' });
  });

  it('the next statement reconciles with the history (OPBD = previous CLBD)', async () => {
    const account = await bcgeAccount();
    await importFixture(account, BCGE_CHF_OCTOBER);

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(BCGE_CHF_NOVEMBER),
    });

    expect(preview.counts).toEqual({ total: 7, new: 7, duplicate: 0, nearDuplicate: 0 });
    expect(preview.reconciliation).toEqual({
      status: 'ok',
      opening: { statementMinor: 1690815, computedMinor: 1690815, differenceMinor: 0 },
      closing: { statementMinor: 2115665, computedMinor: 2115665, differenceMinor: 0 },
      runningBalanceBreaks: [],
    });
    // October's pending card payment arrives booked, under its new reference
    expect(preview.entries[0]).toMatchObject({
      bookingDate: '2025-11-03',
      amountMinor: -4500,
      bankReference: 'BCGE20251103000021',
    });
  });

  it('a tampered file fails reconciliation by the changed amount', async () => {
    const account = await bcgeAccount();

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(BCGE_CHF_TAMPERED),
    });

    expect(preview.reconciliation).toEqual({
      status: 'mismatch',
      opening: null,
      closing: { statementMinor: 1690815, computedMinor: 1708815, differenceMinor: 18000 },
      runningBalanceBreaks: [],
    });
  });

  it('works for a EUR Account', async () => {
    const account = await bcgeAccount({ currency: 'EUR', iban: 'CH3100788000050012399' });

    const committed = await importFixture(account, BCGE_EUR_OCTOBER);

    expect(committed).toMatchObject({
      addedCount: 3,
      openingBalanceMinor: 125000,
      closingBalanceMinor: 181950,
      reconciliationStatus: 'ok',
    });
    const transactions = await listImportTransactions(t.ctx, committed.id);
    expect(transactions.map((tr) => [tr.currency, tr.amountMinor, tr.counterpartyIban])).toEqual([
      ['EUR', 107250, 'CH6900235235123456010'],
      ['EUR', -50000, 'FR7618206004006123456789050'],
      ['EUR', -300, null],
    ]);
    expect(transactions[2]!.fingerprint).toMatch(/^h:/);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(181950);
  });
});

interface SyntheticEntry {
  status: string;
  amount: string;
  direction?: 'CRDT' | 'DBIT';
  bookingDate?: string;
  reference?: string;
  currency?: string;
  info?: string;
}

function syntheticEntry(entry: SyntheticEntry): string {
  return `<Ntry>
      <Amt Ccy="${entry.currency ?? 'CHF'}">${entry.amount}</Amt>
      <CdtDbtInd>${entry.direction ?? 'DBIT'}</CdtDbtInd>
      ${entry.status}
      ${entry.bookingDate ? `<BookgDt><DtTm>${entry.bookingDate}T10:00:00</DtTm></BookgDt>` : ''}
      ${entry.reference ? `<AcctSvcrRef>${entry.reference}</AcctSvcrRef>` : ''}
      <AddtlNtryInf>${entry.info ?? 'Paiement &amp; frais'}</AddtlNtryInf>
    </Ntry>`;
}

/** A minimal camt.053.001.08 statement (with `Sts/Cd` and namespace prefixes). */
function syntheticStatement(entries: SyntheticEntry[], closing = '90.00'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- synthetic -->
<Document xmlns:c="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <Acct><Id><IBAN>CH34 0078 8000 0500 1234 5</IBAN></Id><Ccy>CHF</Ccy></Acct>
    <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="CHF">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2025-12-01</Dt></Dt></Bal>
    <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="CHF">${closing}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2025-12-31</Dt></Dt></Bal>
    ${entries.map(syntheticEntry).join('\n')}
  </Stmt></BkToCstmrStmt>
</Document>`.replace(/<(\/?)([A-Z])/g, '<$1c:$2');
}

describe('synthetic CAMT.053 files', () => {
  it('skips entries that are not booked (pending, information)', async () => {
    const account = await bcgeAccount();

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...xmlFile(
        syntheticStatement([
          { status: '<Sts><Cd>PDNG</Cd></Sts>', amount: '45.00', reference: 'PENDING-1' },
          {
            status: '<Sts><Cd>BOOK</Cd></Sts>',
            amount: '10.00',
            bookingDate: '2025-12-03',
            reference: 'BOOKED-1',
          },
          { status: '<Sts><Cd>INFO</Cd></Sts>', amount: '5.00', bookingDate: '2025-12-04' },
        ]),
      ),
    });

    expect(preview.entries).toHaveLength(1);
    expect(preview.entries[0]).toMatchObject({
      bankReference: 'BOOKED-1',
      bookingDate: '2025-12-03',
      amountMinor: -1000,
      rawDescription: 'Paiement & frais',
    });
    expect(preview.reconciliation.status).toBe('ok');
  });

  it('reads amounts without a leading zero (".3"), as BCGE writes them', async () => {
    const account = await bcgeAccount();

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...xmlFile(
        syntheticStatement(
          [
            { status: '<Sts>BOOK</Sts>', amount: '.3', bookingDate: '2025-12-03' },
            { status: '<Sts>BOOK</Sts>', amount: '9.7', bookingDate: '2025-12-04' },
          ],
          '90.00',
        ),
      ),
    });

    expect(preview.entries.map((entry) => entry.amountMinor)).toEqual([-30, -970]);
    expect(preview.reconciliation.status).toBe('ok');
  });

  it('skips the pending entry of the BCGE export', async () => {
    const account = await bcgeAccount();

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...fixture(BCGE_CHF_OCTOBER),
    });

    expect(preview.entries.map((entry) => entry.bankReference)).not.toContain('BCGE20251031000950');
  });

  it('rejects files that are not CAMT.053, or are damaged', async () => {
    const account = await bcgeAccount();
    const formatError = "This file doesn't match the Account's Import format (BCGE CAMT.053)";
    const preview = (file: { fileName: string; content: Uint8Array }) =>
      previewImport(t.ctx, { accountId: account.id, ...file });

    await expect(preview(fixture('ubs/ubs-chf-2025-10.csv'))).rejects.toThrow(formatError);
    await expect(preview(xmlFile('<Document><Other/></Document>'))).rejects.toThrow(
      'not a CAMT.053 statement',
    );
    const booked = { status: '<Sts>BOOK</Sts>', amount: '10.00', bookingDate: '2025-12-03' };
    await expect(
      preview(xmlFile(syntheticStatement([booked]).replace('</c:Document>', ''))),
    ).rejects.toThrow('is not closed');
    await expect(
      preview(xmlFile(syntheticStatement([{ ...booked, amount: '10,00' }]))),
    ).rejects.toThrow('is not an amount');
    await expect(
      preview(xmlFile(syntheticStatement([{ ...booked, amount: '.' }]))),
    ).rejects.toThrow('is not an amount');
    await expect(
      preview(xmlFile(syntheticStatement([{ ...booked, bookingDate: undefined }]))),
    ).rejects.toThrow('has no booking date');
    await expect(
      preview(xmlFile(`<!DOCTYPE x [<!ENTITY a "b">]>${syntheticStatement([booked])}`)),
    ).rejects.toThrow('document type declaration');
  });

  it('rejects an entry in another Currency than the Account', async () => {
    const account = await bcgeAccount();

    await expect(
      previewImport(t.ctx, {
        accountId: account.id,
        ...xmlFile(
          syntheticStatement([
            {
              status: '<Sts>BOOK</Sts>',
              amount: '10.00',
              bookingDate: '2025-12-03',
              currency: 'EUR',
            },
          ]),
        ),
      }),
    ).rejects.toThrow('EUR');
  });
});
