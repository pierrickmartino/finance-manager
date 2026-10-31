import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, type Account, type AccountInput } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { backfillRates, type EcbRateSource } from '../fx';
import {
  commitImport,
  getImportPreview,
  listImportTransactions,
  previewImport,
  undoImport,
  type ImportPreview,
} from '../imports';
import { createRule } from '../rules';
import {
  editClassification,
  getClassification,
  getTransaction,
  type Transaction,
} from '../transactions';

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
const UBS_IBAN = 'CH6900235235123456010';
const BCGE_CHF_IBAN = 'CH3400788000050012345';
const BCGE_EUR_IBAN = 'CH3100788000050012399';
const CA_IBAN = 'FR7618206004006123456789050';

function fixture(name: string) {
  return { fileName: path.basename(name), content: readFileSync(path.join(FIXTURES, name)) };
}

async function account(input: Pick<AccountInput, 'name' | 'currency' | 'iban' | 'importFormat'>) {
  const bank = await createBank(t.ctx, { name: `Bank ${input.name}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    kind: 'current',
    openingBalanceMinor: 0,
    ...input,
  });
}

const ubsAccount = () =>
  account({ name: 'UBS', currency: 'CHF', iban: UBS_IBAN, importFormat: 'ubs_csv' });
const bcgeChfAccount = () =>
  account({ name: 'BCGE CHF', currency: 'CHF', iban: BCGE_CHF_IBAN, importFormat: 'camt053' });
const bcgeEurAccount = () =>
  account({ name: 'BCGE EUR', currency: 'EUR', iban: BCGE_EUR_IBAN, importFormat: 'camt053' });
const caAccount = () =>
  account({ name: 'Crédit Agricole', currency: 'EUR', iban: CA_IBAN, importFormat: 'ofx' });

async function importFile(on: Account, name: string): Promise<Transaction[]> {
  const preview = await previewImport(t.ctx, { accountId: on.id, ...fixture(name) });
  const committed = await commitImport(t.ctx, { previewId: preview.id });
  return listImportTransactions(t.ctx, committed.id);
}

const preview = (on: Account, name: string) =>
  previewImport(t.ctx, { accountId: on.id, ...fixture(name) });

function entryOf(result: ImportPreview, bankReference: string) {
  const entry = result.entries.find((e) => e.bankReference === bankReference);
  if (!entry) throw new Error(`No entry ${bankReference}`);
  return entry;
}

const summary = (result: ImportPreview, bankReference: string) =>
  entryOf(result, bankReference).transferCandidates.map((candidate) => ({
    bankReference: candidate.transaction.bankReference,
    accountName: candidate.transaction.accountName,
    isPreselected: candidate.isPreselected,
  }));

const byReference = (transactions: Transaction[], bankReference: string) =>
  transactions.find((transaction) => transaction.bankReference === bankReference)!;

/** Stores one CHF-per-EUR rate for every day of October 2025 (the only test double: the ECB). */
async function eurRate(chfPerEur: string): Promise<void> {
  const source: EcbRateSource = {
    async fetchReferenceRates({ from, to }) {
      const days = [];
      for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`);) {
        days.push({ date: d.toISOString().slice(0, 10), perEur: { CHF: chfPerEur } });
        d = new Date(d.getTime() + 86_400_000);
      }
      return days;
    },
  };
  await backfillRates(t.ctx, source, { from: '2025-10-01', to: '2025-10-31' });
}

describe('Transfer candidates in the Import preview', () => {
  it('pre-selects a same-currency candidate when the counterparty IBAN is one of my Accounts', async () => {
    // BCGE CHF -2000.00 ↔ UBS +2000.00, both 2025-10-10; UBS names the BCGE CHF IBAN.
    await importFile(await bcgeChfAccount(), 'bcge/bcge-chf-2025-10.xml');

    const result = await preview(await ubsAccount(), 'ubs/ubs-chf-2025-10.csv');

    expect(summary(result, '9930283TI0000105')).toEqual([
      { bankReference: 'BCGE20251010000342', accountName: 'BCGE CHF', isPreselected: true },
    ]);
    expect(
      result.entries
        .filter((entry) => entry.bankReference !== '9930283TI0000105')
        .every((entry) => entry.transferCandidates.length === 0),
    ).toBe(true);
  });

  it('accepts a cross-currency pair within 2% after conversion', async () => {
    // UBS -1000.00 CHF (2025-10-14) ↔ BCGE EUR +1072.50 EUR (2025-10-15): 0.9324 CHF/EUR.
    await eurRate('0.9324');
    await importFile(await bcgeEurAccount(), 'bcge/bcge-eur-2025-10.xml');

    const result = await preview(await ubsAccount(), 'ubs/ubs-chf-2025-10.csv');

    expect(summary(result, '9930287TI0000106')).toEqual([
      { bankReference: 'BCGE20251015000613', accountName: 'BCGE EUR', isPreselected: true },
    ]);
  });

  it('rejects a cross-currency pair 3% off after conversion', async () => {
    await eurRate('0.9604');
    await importFile(await bcgeEurAccount(), 'bcge/bcge-eur-2025-10.xml');

    const result = await preview(await ubsAccount(), 'ubs/ubs-chf-2025-10.csv');

    expect(summary(result, '9930287TI0000106')).toEqual([]);
  });

  it('pre-selects from the other side when the OFX file has no counterparty IBAN', async () => {
    // BCGE EUR -500.00 (2025-10-20) names the CA IBAN ↔ CA +500.00 (2025-10-22).
    await importFile(await bcgeEurAccount(), 'bcge/bcge-eur-2025-10.xml');

    const result = await preview(await caAccount(), 'credit-agricole/ca-eur-2025-10.ofx');

    expect(summary(result, '2510220000005')).toEqual([
      { bankReference: 'BCGE20251020000255', accountName: 'BCGE EUR', isPreselected: true },
    ]);
  });
});

describe('confirm Transfer candidates on commit', () => {
  it('links nothing without confirmation, even a pre-selected candidate', async () => {
    const bcge = await importFile(await bcgeChfAccount(), 'bcge/bcge-chf-2025-10.xml');

    const ubs = await importFile(await ubsAccount(), 'ubs/ubs-chf-2025-10.csv');

    expect(byReference(ubs, '9930283TI0000105').transferId).toBeNull();
    expect(byReference(bcge, 'BCGE20251010000342').transferId).toBeNull();
  });

  it('links a confirmed candidate, clears its Category, and Rules skip the new side', async () => {
    const bcgeAccount = await bcgeChfAccount();
    const bcge = await importFile(bcgeAccount, 'bcge/bcge-chf-2025-10.xml');
    const out = byReference(bcge, 'BCGE20251010000342');
    const group = await createCategoryGroup(t.ctx, { name: 'Income', type: 'income' });
    const other = await createCategory(t.ctx, { groupId: group.id, name: 'Other' });
    await editClassification(t.ctx, out.id, { categoryId: other.id });
    const ubsAcc = await ubsAccount();
    await createRule(t.ctx, {
      name: 'UBS income',
      conditions: [
        { type: 'account', accountIds: [ubsAcc.id] },
        { type: 'direction', direction: 'in' },
      ],
      actions: { categoryId: other.id },
    });
    const result = await preview(ubsAcc, 'ubs/ubs-chf-2025-10.csv');
    const entry = entryOf(result, '9930283TI0000105');

    const committed = await commitImport(t.ctx, {
      previewId: result.id,
      transferDecisions: { [entry.fingerprint]: out.id },
    });

    const into = byReference(await listImportTransactions(t.ctx, committed.id), '9930283TI0000105');
    expect(into.transferId).not.toBeNull();
    expect((await getTransaction(t.ctx, out.id)).transferId).toBe(into.transferId);
    expect((await getClassification(t.ctx, into.id)).category).toBeNull();
    expect((await getClassification(t.ctx, out.id)).category).toBeNull();
    const salary = byReference(
      await listImportTransactions(t.ctx, committed.id),
      '9930298TI0000112',
    );
    expect((await getClassification(t.ctx, salary.id)).category?.id).toBe(other.id);
  });

  it('refuses to link a Transaction that is not a candidate of the entry', async () => {
    const bcge = await importFile(await bcgeChfAccount(), 'bcge/bcge-chf-2025-10.xml');
    const result = await preview(await ubsAccount(), 'ubs/ubs-chf-2025-10.csv');
    const entry = entryOf(result, '9930283TI0000105');

    await expect(
      commitImport(t.ctx, {
        previewId: result.id,
        transferDecisions: { [entry.fingerprint]: byReference(bcge, 'BCGE20251031000901').id },
      }),
    ).rejects.toThrow(/no longer a Transfer candidate/);
    expect((await getImportPreview(t.ctx, result.id)).id).toBe(result.id);
  });

  it('Import undo unlinks the Transfers, leaving the other side unlinked', async () => {
    const bcgeAccount = await bcgeChfAccount();
    const bcge = await importFile(bcgeAccount, 'bcge/bcge-chf-2025-10.xml');
    const out = byReference(bcge, 'BCGE20251010000342');
    const result = await preview(await ubsAccount(), 'ubs/ubs-chf-2025-10.csv');
    const committed = await commitImport(t.ctx, {
      previewId: result.id,
      transferDecisions: { [entryOf(result, '9930283TI0000105').fingerprint]: out.id },
    });
    expect((await getTransaction(t.ctx, out.id)).transferId).not.toBeNull();

    await undoImport(t.ctx, committed.id);

    expect((await getTransaction(t.ctx, out.id)).transferId).toBeNull();
  });
});
