import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import { seedTransactions, type SeedTransaction } from '@test/support/transactions';
import { createAccount, type Account } from '../accounts';
import { createBank } from '../banks';
import { createCategory, createCategoryGroup } from '../categories';
import { commitImport, getImportPreview, listImportTransactions, previewImport } from '../imports';
import { createPayee } from '../payees';
import { createRule } from '../rules';
import { applyRulesToExisting, previewApplyRules } from '../rules/existing';
import { linkTransfer } from '../transfers';
import { getClassification, getTransaction, listTransactions, unlockFields } from '.';
import { createManualTransaction, updateManualTransaction } from './manual';
import { splitTransaction } from './split';

/** ADR-0004: a Transaction is either split or part of a Transfer, never both. */

const t = setupTestDatabase();

const FIXTURES = path.join(import.meta.dirname, '../../../../test/fixtures/import');

function fixture(name: string) {
  return { fileName: path.basename(name), content: readFileSync(path.join(FIXTURES, name)) };
}

async function account(
  name: string,
  { iban = null, importFormat = 'ubs_csv' }: Partial<Pick<Account, 'iban' | 'importFormat'>> = {},
): Promise<Account> {
  const bank = await createBank(t.ctx, { name: `Bank ${name}` });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name,
    currency: 'CHF',
    iban,
    kind: 'current',
    importFormat,
    openingBalanceMinor: 0,
  });
}

async function seedOne(on: Account, row: Partial<SeedTransaction> = {}): Promise<string> {
  const [id] = await seedTransactions(t.ctx.db, on, [
    { bookingDate: '2025-10-10', amountMinor: -200000, rawDescription: 'ORDRE E-BANKING', ...row },
  ]);
  return id!;
}

async function categories() {
  const group = await createCategoryGroup(t.ctx, { name: 'Home', type: 'expense' });
  const rent = await createCategory(t.ctx, { groupId: group.id, name: 'Rent' });
  const savings = await createCategory(t.ctx, { groupId: group.id, name: 'Savings' });
  return { rent, savings };
}

/** Two opposite Transactions on two Accounts, ready to link. */
async function pair() {
  const ubs = await account('UBS');
  const bcge = await account('BCGE');
  const out = await seedOne(bcge, { amountMinor: -200000 });
  const into = await seedOne(ubs, { amountMinor: 200000 });
  return { ubs, bcge, out, into };
}

async function splitInHalves(id: string, amountMinor: number): Promise<void> {
  const { rent, savings } = await categories();
  await splitTransaction(t.ctx, id, [
    { amountMinor: amountMinor / 2, categoryId: rent.id },
    { amountMinor: amountMinor / 2, categoryId: savings.id },
  ]);
}

describe('linking a Transfer refuses a split Transaction', () => {
  it.each(['out', 'into'] as const)('refuses when the %s side is split', async (side) => {
    const sides = await pair();
    await splitInHalves(sides[side], side === 'out' ? -200000 : 200000);

    await expect(
      linkTransfer(t.ctx, { transactionIds: [sides.out, sides.into] }),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringMatching(/Split/) });

    expect((await getTransaction(t.ctx, sides.out)).transferId).toBeNull();
    expect((await getClassification(t.ctx, sides[side])).splitLines).toHaveLength(2);
  });
});

describe('Transfer decisions at Import commit refuse a split Transaction', () => {
  it('refuses the whole Import, naming the Split', async () => {
    const bcge = await account('BCGE CHF', {
      iban: 'CH3400788000050012345',
      importFormat: 'camt053',
    });
    const bcgePreview = await previewImport(t.ctx, {
      accountId: bcge.id,
      ...fixture('bcge/bcge-chf-2025-10.xml'),
    });
    const bcgeImport = await commitImport(t.ctx, { previewId: bcgePreview.id });
    const out = (await listImportTransactions(t.ctx, bcgeImport.id)).find(
      (transaction) => transaction.bankReference === 'BCGE20251010000342',
    )!;
    await splitInHalves(out.id, out.amountMinor);
    const ubs = await account('UBS', { iban: 'CH6900235235123456010' });
    const result = await previewImport(t.ctx, {
      accountId: ubs.id,
      ...fixture('ubs/ubs-chf-2025-10.csv'),
    });
    const entry = result.entries.find((e) => e.bankReference === '9930283TI0000105')!;

    await expect(
      commitImport(t.ctx, {
        previewId: result.id,
        transferDecisions: { [entry.fingerprint]: out.id },
      }),
    ).rejects.toMatchObject({ code: 'validation', message: expect.stringMatching(/Split/) });

    expect((await listTransactions(t.ctx, { accountId: ubs.id })).transactions).toEqual([]);
    expect((await getImportPreview(t.ctx, result.id)).id).toBe(result.id);
    expect((await getTransaction(t.ctx, out.id)).transferId).toBeNull();
    expect((await getClassification(t.ctx, out.id)).splitLines).toHaveLength(2);
  });
});

describe('splitting refuses a Transaction that is part of a Transfer', () => {
  it('refuses with a validation error and leaves the Transfer as it was', async () => {
    const { out, into } = await pair();
    const transfer = await linkTransfer(t.ctx, { transactionIds: [out, into] });

    await expect(splitInHalves(out, -200000)).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringMatching(/Transfer/),
    });

    expect((await getTransaction(t.ctx, out)).transferId).toBe(transfer.id);
    expect((await getClassification(t.ctx, out)).splitLines).toEqual([]);
  });
});

/** A split Transaction and a Rule matching it that sets a Payee and a Category. */
async function splitTransactionAndRule() {
  const bcge = await account('BCGE');
  const id = await seedOne(bcge);
  await splitInHalves(id, -200000);
  const group = await createCategoryGroup(t.ctx, { name: 'Bank', type: 'expense' });
  const fees = await createCategory(t.ctx, { groupId: group.id, name: 'Fees' });
  const landlord = await createPayee(t.ctx, 'Landlord');
  await createRule(t.ctx, {
    name: 'Bank orders',
    conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'ordre' }],
    actions: { payeeId: landlord.id, categoryId: fees.id },
  });
  const lines = (await getClassification(t.ctx, id)).splitLines;
  return { id, landlord, lines };
}

describe('Rules applied to existing Transactions never set a split Transaction’s Category', () => {
  it('sets the Payee but leaves the Category empty and the Split lines unchanged', async () => {
    const { id, landlord, lines } = await splitTransactionAndRule();

    const preview = await previewApplyRules(t.ctx, {});
    await applyRulesToExisting(t.ctx, {});

    expect(preview.fieldCounts).toMatchObject({ payee: 1, category: 0 });
    const after = await getClassification(t.ctx, id);
    expect(after.payee?.id).toBe(landlord.id);
    expect(after.category).toBeNull();
    expect(after.splitLines).toEqual(lines);
  });

  it('still leaves the Category empty after the user unlocked it', async () => {
    const { id, landlord, lines } = await splitTransactionAndRule();
    await unlockFields(t.ctx, id, ['category']);

    const preview = await previewApplyRules(t.ctx, {});
    await applyRulesToExisting(t.ctx, {});

    expect(preview.fieldCounts).toMatchObject({ payee: 1, category: 0 });
    const after = await getClassification(t.ctx, id);
    expect(after.payee?.id).toBe(landlord.id);
    expect(after.category).toBeNull();
    expect(after.splitLines).toEqual(lines);
  });

  it('Rules on saving a split Manual transaction set its Payee, not its Category', async () => {
    const ubs = await account('UBS');
    const group = await createCategoryGroup(t.ctx, { name: 'Bank', type: 'expense' });
    const fees = await createCategory(t.ctx, { groupId: group.id, name: 'Fees' });
    const landlord = await createPayee(t.ctx, 'Landlord');
    const manual = await createManualTransaction(t.ctx, {
      accountId: ubs.id,
      bookingDate: '2025-10-10',
      amountMinor: -200000,
      description: 'Rent October',
    });
    await splitInHalves(manual.id, -200000);
    await unlockFields(t.ctx, manual.id, ['category']);
    await createRule(t.ctx, {
      name: 'Rent',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'rent' }],
      actions: { payeeId: landlord.id, categoryId: fees.id },
    });
    const lines = (await getClassification(t.ctx, manual.id)).splitLines;

    await updateManualTransaction(t.ctx, manual.id, {
      bookingDate: '2025-10-11',
      amountMinor: -200000,
      description: 'Rent October',
    });

    const after = await getClassification(t.ctx, manual.id);
    expect(after.payee?.id).toBe(landlord.id);
    expect(after.category).toBeNull();
    expect(after.splitLines).toEqual(lines);
  });

  it('never creates Split lines', async () => {
    const bcge = await account('BCGE');
    const id = await seedOne(bcge);
    const group = await createCategoryGroup(t.ctx, { name: 'Bank', type: 'expense' });
    const fees = await createCategory(t.ctx, { groupId: group.id, name: 'Fees' });
    await createRule(t.ctx, {
      name: 'Bank orders',
      conditions: [{ type: 'text', field: 'description', operator: 'contains', value: 'ordre' }],
      actions: { categoryId: fees.id },
    });

    await applyRulesToExisting(t.ctx, {});

    const after = await getClassification(t.ctx, id);
    expect(after.category?.id).toBe(fees.id);
    expect(after.splitLines).toEqual([]);
  });
});
