import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { createAccount, getAccount, type Account, type AccountInput } from '../accounts';
import { createBank } from '../banks';
import { listHistory } from '../history';
import { refuseBankFieldChanges } from '../transactions/bank-fields';
import {
  commitImport,
  deleteImportedTransaction,
  getImport,
  listImports,
  listImportTransactions,
  previewImport,
  undoImport,
  type Import,
} from '.';

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');
const UBS_OCTOBER = 'ubs/ubs-chf-2025-10.csv';
const UBS_OVERLAP = 'ubs/ubs-chf-2025-10-16_2025-11-15-overlap.csv';
/** The Télécom row of the October file: -64.90 booked on 2025-10-15. */
const TELECOM_REFERENCE = '9930288TI0000107';
/** A reference no fixture uses: the same Télécom row, as a later export might renumber it. */
const RENUMBERED_REFERENCE = '9930288TI0000999';

function fixture(name: string): { fileName: string; content: Uint8Array } {
  return { fileName: path.basename(name), content: readFileSync(path.join(FIXTURES, name)) };
}

/** The October file again, with the Télécom row under another bank reference. */
function octoberWithRenumberedTelecom(): { fileName: string; content: Uint8Array } {
  const text = readFileSync(path.join(FIXTURES, UBS_OCTOBER), 'utf8');
  if (!text.includes(TELECOM_REFERENCE)) throw new Error('Fixture changed: Télécom row not found');
  return {
    fileName: 'ubs-chf-2025-10-renumbered.csv',
    content: new TextEncoder().encode(text.replace(TELECOM_REFERENCE, RENUMBERED_REFERENCE)),
  };
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

async function importFixture(account: Account, name: string): Promise<Import> {
  const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(name) });
  return commitImport(t.ctx, { previewId: preview.id });
}

describe('near-duplicates', () => {
  it('flags an entry with the same amount and booking date but another Fingerprint, next to the existing Transaction', async () => {
    const account = await ubsAccount();
    const october = await importFixture(account, UBS_OCTOBER);
    const telecom = (await listImportTransactions(t.ctx, october.id)).find(
      (tr) => tr.bankReference === TELECOM_REFERENCE,
    );

    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...octoberWithRenumberedTelecom(),
    });

    expect(preview.counts).toEqual({ total: 14, new: 0, duplicate: 13, nearDuplicate: 1 });
    const flagged = preview.entries.filter((entry) => entry.status === 'near_duplicate');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({
      bankReference: RENUMBERED_REFERENCE,
      fingerprint: RENUMBERED_REFERENCE,
      bookingDate: '2025-10-15',
      amountMinor: -6490,
      nearDuplicates: [telecom],
    });
    const others = preview.entries.filter((entry) => entry.status !== 'near_duplicate');
    expect(others.every((entry) => entry.nearDuplicates.length === 0)).toBe(true);
  });

  it('is skipped on commit by default', async () => {
    const account = await ubsAccount();
    await importFixture(account, UBS_OCTOBER);
    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...octoberWithRenumberedTelecom(),
    });

    const committed = await commitImport(t.ctx, { previewId: preview.id });

    expect(committed).toMatchObject({
      addedCount: 0,
      duplicateCount: 14,
      reconciliationStatus: 'ok',
    });
    expect(await listImportTransactions(t.ctx, committed.id)).toEqual([]);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1290305);
  });

  it('is added when the user keeps it, and the reconciliation counts it', async () => {
    const account = await ubsAccount();
    await importFixture(account, UBS_OCTOBER);
    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...octoberWithRenumberedTelecom(),
    });

    const committed = await commitImport(t.ctx, {
      previewId: preview.id,
      nearDuplicateDecisions: { [RENUMBERED_REFERENCE]: 'keep' },
    });

    expect(committed).toMatchObject({ addedCount: 1, duplicateCount: 13 });
    // The file's closing balance does not include a second Télécom bill: 64.90 too low
    expect(committed.reconciliation.closing).toEqual({
      statementMinor: 1290305,
      computedMinor: 1283815,
      differenceMinor: -6490,
    });
    expect(
      (await listImportTransactions(t.ctx, committed.id)).map((tr) => tr.bankReference),
    ).toEqual([RENUMBERED_REFERENCE]);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1290305 - 6490);
  });

  it('is skipped when the user says so', async () => {
    const account = await ubsAccount();
    await importFixture(account, UBS_OCTOBER);
    const preview = await previewImport(t.ctx, {
      accountId: account.id,
      ...octoberWithRenumberedTelecom(),
    });

    const committed = await commitImport(t.ctx, {
      previewId: preview.id,
      nearDuplicateDecisions: { [RENUMBERED_REFERENCE]: 'skip' },
    });

    expect(committed.addedCount).toBe(0);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1290305);
  });
});

describe('undo an Import', () => {
  it('deletes exactly its Transactions, restores the balance and marks it undone, in one Batch', async () => {
    const account = await ubsAccount();
    const october = await importFixture(account, UBS_OCTOBER);
    const overlap = await importFixture(account, UBS_OVERLAP);
    const removed = await listImportTransactions(t.ctx, overlap.id);
    expect(removed).toHaveLength(5);

    const undone = await undoImport(t.ctx, overlap.id);

    expect(undone.undoneAt).toBeInstanceOf(Date);
    expect(await getImport(t.ctx, overlap.id)).toEqual(undone);
    expect(await listImportTransactions(t.ctx, overlap.id)).toEqual([]);
    expect(await listImportTransactions(t.ctx, october.id)).toHaveLength(14);
    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      openingBalanceMinor: 845035,
      balanceMinor: 1290305,
    });

    const batchId = (await listHistory(t.ctx, { entityType: 'import', entityId: overlap.id }))[0]!
      .batchId;
    const batch = await listHistory(t.ctx, { batchId });
    expect(new Set(batch.map((entry) => `${entry.entityType}:${entry.entityId}`))).toEqual(
      new Set([`import:${overlap.id}`, ...removed.map((tr) => `transaction:${tr.id}`)]),
    );
    expect(batch.filter((entry) => entry.entityType === 'transaction')).toSatisfy(
      (entries: { after: unknown }[]) => entries.every((entry) => entry.after === null),
    );
    expect(new Set(batch.map((entry) => entry.actorType))).toEqual(new Set(['manual']));
  });

  it('lets the same file be imported again afterwards', async () => {
    const account = await ubsAccount();
    await importFixture(account, UBS_OCTOBER);
    const overlap = await importFixture(account, UBS_OVERLAP);
    await undoImport(t.ctx, overlap.id);

    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OVERLAP) });
    expect(preview.counts).toEqual({ total: 12, new: 5, duplicate: 7, nearDuplicate: 0 });
    const again = await commitImport(t.ctx, { previewId: preview.id });

    expect(again).toMatchObject({ addedCount: 5, reconciliationStatus: 'ok', undoneAt: null });
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1049030);
    expect((await listImports(t.ctx, account.id)).map((i) => i.undoneAt === null)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('undoing the only Import also restores the opening balance it set', async () => {
    const account = await ubsAccount();
    const october = await importFixture(account, UBS_OCTOBER);

    await undoImport(t.ctx, october.id);

    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      openingBalanceMinor: 0,
      openingDate: null,
      balanceMinor: 0,
    });
    // As if it had never been imported: the opening balance is proposed again
    const preview = await previewImport(t.ctx, { accountId: account.id, ...fixture(UBS_OCTOBER) });
    expect(preview.proposedOpeningBalance).toEqual({ amountMinor: 845035, date: '2025-10-01' });
    await commitImport(t.ctx, { previewId: preview.id });
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1290305);
  });

  it('keeps the opening balance while other Transactions remain', async () => {
    const account = await ubsAccount();
    const october = await importFixture(account, UBS_OCTOBER);
    await importFixture(account, UBS_OVERLAP);

    await undoImport(t.ctx, october.id);

    expect(await getAccount(t.ctx, account.id)).toMatchObject({
      openingBalanceMinor: 845035,
      openingDate: '2025-10-01',
      // The opening balance plus the 5 Transactions only the overlapping file had
      balanceMinor: 845035 - 215000 - 10230 - 3870 - 6490 - 5685,
    });
  });

  it('refuses to undo an Import twice', async () => {
    const account = await ubsAccount();
    const october = await importFixture(account, UBS_OCTOBER);
    await undoImport(t.ctx, october.id);

    await expect(undoImport(t.ctx, october.id)).rejects.toThrow(
      'This Import has already been undone',
    );
    await expect(undoImport(t.ctx, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(
      'Import not found',
    );
  });
});

describe('delete one imported Transaction', () => {
  it('removes it from the Account and records the deletion in History', async () => {
    const account = await ubsAccount();
    const october = await importFixture(account, UBS_OCTOBER);
    const telecom = (await listImportTransactions(t.ctx, october.id)).find(
      (tr) => tr.bankReference === TELECOM_REFERENCE,
    )!;

    await deleteImportedTransaction(t.ctx, telecom.id);

    expect(
      (await listImportTransactions(t.ctx, october.id)).map((tr) => tr.bankReference),
    ).not.toContain(TELECOM_REFERENCE);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(1290305 + 6490);
    const entries = await listHistory(t.ctx, { entityType: 'transaction', entityId: telecom.id });
    const deletion = entries.filter((entry) => entry.batchId === entries[0]!.batchId);
    expect(deletion).toContainEqual(
      expect.objectContaining({
        actorType: 'manual',
        field: 'amountMinor',
        before: -6490,
        after: null,
      }),
    );
    expect(deletion.every((entry) => entry.after === null)).toBe(true);
    // The Import stands; undoing it later deletes the rest
    await undoImport(t.ctx, october.id);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(0);
  });

  it('refuses an unknown Transaction', async () => {
    await expect(
      deleteImportedTransaction(t.ctx, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow('Transaction not found');
    await expect(deleteImportedTransaction(t.ctx, 'nope')).rejects.toThrow('Transaction not found');
  });
});

describe('bank fields of an imported Transaction', () => {
  it('refuses an edit of a bank field, and lets classification fields through', async () => {
    const account = await ubsAccount();
    const october = await importFixture(account, UBS_OCTOBER);
    const [rent] = await listImportTransactions(t.ctx, october.id);

    expect(() => refuseBankFieldChanges(rent!, { amountMinor: 1 })).toThrow(
      "The bank fields of an imported Transaction can't be edited (amount)",
    );
    expect(() =>
      refuseBankFieldChanges(rent!, { bookingDate: '2025-10-02', rawDescription: 'x' }),
    ).toThrow('(booking date, original text)');
    // The same value is not a change; notes are not a bank field
    expect(() =>
      refuseBankFieldChanges(rent!, { amountMinor: rent!.amountMinor, notes: 'rent' }),
    ).not.toThrow();
    // A Manual transaction has no bank fields to protect
    expect(() =>
      refuseBankFieldChanges({ ...rent!, isManual: true }, { amountMinor: 1 }),
    ).not.toThrow();
  });
});
