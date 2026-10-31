import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@test/support/db';
import {
  archiveAccount,
  createAccount,
  getAccount,
  updateAccount,
  type Account,
  type AccountInput,
} from '../accounts';
import { createBank } from '../banks';
import { ConflictError, ValidationError } from '../errors';
import { listHistory } from '../history';
import { commitImport, listImportTransactions, previewImport } from '../imports';
import {
  createManualTransaction,
  deleteManualTransaction,
  listManualTransactions,
  updateManualTransaction,
} from './manual';
import type { Transaction } from './model';

const t = setupTestDatabase();

async function clerAccount(overrides: Partial<AccountInput> = {}): Promise<Account> {
  const bank = await createBank(t.ctx, { name: 'Cler' });
  return createAccount(t.ctx, {
    bankId: bank.id,
    name: 'Cler current',
    currency: 'CHF',
    iban: null,
    kind: 'current',
    importFormat: null,
    openingBalanceMinor: 100000,
    openingDate: '2021-01-01',
    ...overrides,
  });
}

describe('create a Manual transaction', () => {
  it('stores it in the Account Currency with no Fingerprint and records its creation', async () => {
    const account = await clerAccount();

    const created = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-03-14',
      amountMinor: -4590,
      description: 'Coop Pronto',
      counterpartyName: 'Coop',
    });

    expect(created).toMatchObject({
      accountId: account.id,
      importId: null,
      isManual: true,
      bookingDate: '2025-03-14',
      amountMinor: -4590,
      currency: 'CHF',
      fingerprint: null,
      rawDescription: 'Coop Pronto',
      counterpartyName: 'Coop',
    });
    const history = await listHistory(t.ctx, { entityType: 'transaction', entityId: created.id });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'amountMinor', before: null, after: -4590 }),
        expect.objectContaining({ field: 'bookingDate', before: null, after: '2025-03-14' }),
      ]),
    );
    expect(history.every((entry) => entry.actorType === 'manual')).toBe(true);
  });

  it('counts in the Account balance', async () => {
    const account = await clerAccount();

    await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-03-14',
      amountMinor: -4590,
      description: 'Coop Pronto',
    });
    await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-03-25',
      amountMinor: 520000,
      description: 'Salary',
    });

    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(100000 - 4590 + 520000);
  });
});

describe('list Manual transactions', () => {
  it("lists an Account's Manual transactions by booking date, then entry order", async () => {
    const account = await clerAccount();
    await manual(account, '2025-03-14', -100, 'Second');
    await manual(account, '2025-03-01', -200, 'First');
    await manual(account, '2025-03-14', -300, 'Third');

    const listed = await listManualTransactions(t.ctx, account.id);

    expect(listed.map((transaction) => transaction.rawDescription)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });
});

describe('Manual transaction input', () => {
  it('refuses a zero amount', async () => {
    const account = await clerAccount();

    await expect(
      createManualTransaction(t.ctx, {
        accountId: account.id,
        bookingDate: '2025-03-14',
        amountMinor: 0,
        description: 'Nothing',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses an archived Account', async () => {
    const account = await clerAccount();
    await archiveAccount(t.ctx, account.id);

    await expect(
      createManualTransaction(t.ctx, {
        accountId: account.id,
        bookingDate: '2025-03-14',
        amountMinor: -100,
        description: 'Late entry',
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('edit a Manual transaction', () => {
  it('changes its fields, records only what changed, and the balance follows', async () => {
    const account = await clerAccount();
    const created = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-03-14',
      amountMinor: -4590,
      description: 'Coop Pronto',
    });

    const edited = await updateManualTransaction(t.ctx, created.id, {
      bookingDate: '2025-03-15',
      amountMinor: -4950,
      description: 'Coop Pronto',
      counterpartyName: 'Coop',
    });

    expect(edited).toMatchObject({ bookingDate: '2025-03-15', amountMinor: -4950 });
    const history = await listHistory(t.ctx, { entityType: 'transaction', entityId: created.id });
    const edits = history
      .filter((entry) => entry.batchId !== history.at(-1)!.batchId)
      .map((entry) => [entry.field, entry.before, entry.after]);
    expect(edits).toEqual(
      expect.arrayContaining([
        ['amountMinor', -4590, -4950],
        ['bookingDate', '2025-03-14', '2025-03-15'],
        ['counterpartyName', null, 'Coop'],
      ]),
    );
    expect(edits).toHaveLength(3);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(100000 - 4950);
  });

  it('refuses to edit an imported Transaction', async () => {
    const imported = await importedTransaction();

    await expect(
      updateManualTransaction(t.ctx, imported.id, {
        bookingDate: imported.bookingDate,
        amountMinor: 1,
        description: 'changed',
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('delete a Manual transaction', () => {
  it('removes it from the balance and records the deletion', async () => {
    const account = await clerAccount();
    const created = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-03-14',
      amountMinor: -4590,
      description: 'Coop Pronto',
    });

    await deleteManualTransaction(t.ctx, created.id);

    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(100000);
    const history = await listHistory(t.ctx, { entityType: 'transaction', entityId: created.id });
    expect(history).toContainEqual(
      expect.objectContaining({ field: 'amountMinor', before: -4590, after: null }),
    );
  });

  it('refuses to delete an imported Transaction', async () => {
    const imported = await importedTransaction();

    await expect(deleteManualTransaction(t.ctx, imported.id)).rejects.toThrow(ValidationError);
  });
});

describe('Manual transactions before an imported period', () => {
  // ubs-chf-2025-10.csv opens on 2025-10-01 at 8450.35 CHF.
  it('reconcile with the Import opening balance when they add up to it', async () => {
    const account = await clerAccount({ importFormat: 'ubs_csv', openingBalanceMinor: 0 });
    await manual(account, '2021-01-04', 800000, 'Opening deposit');
    await manual(account, '2024-06-30', 50000, 'Interest');
    await manual(account, '2025-09-30', -4965, 'Card fee');

    const preview = await previewUbsOctober(account);

    expect(preview.reconciliation.status).toBe('ok');
    expect(preview.reconciliation.opening).toEqual({
      statementMinor: 845035,
      computedMinor: 845035,
      differenceMinor: 0,
    });
    expect(preview.proposedOpeningBalance).toBeNull();
  });

  it('show the difference when one is missing', async () => {
    const account = await clerAccount({ importFormat: 'ubs_csv', openingBalanceMinor: 0 });
    await manual(account, '2021-01-04', 800000, 'Opening deposit');
    await manual(account, '2025-09-30', -4965, 'Card fee');

    const preview = await previewUbsOctober(account);

    expect(preview.reconciliation.status).toBe('mismatch');
    expect(preview.reconciliation.opening).toMatchObject({ differenceMinor: -50000 });
  });
});

describe('Manual history before the opening balance', () => {
  // Committing the October UBS file on an empty Account sets its opening balance to
  // 8450.35 CHF on 2025-10-01: that balance already includes everything before.
  async function importedAccount(): Promise<Account> {
    const account = await clerAccount({ importFormat: 'ubs_csv', openingBalanceMinor: 0 });
    const preview = await previewUbsOctober(account);
    await commitImport(t.ctx, { previewId: preview.id });
    return getAccount(t.ctx, account.id);
  }

  const EARLIER_OPENING =
    "This Account's opening balance is dated 2025-10-01 and already includes everything before. To record earlier history, first set an earlier opening date and balance on the Account page";

  it('refuses a Manual transaction dated before the opening date, which would count twice', async () => {
    const account = await importedAccount();

    await expect(manual(account, '2025-09-30', -4965, 'Card fee')).rejects.toThrow(EARLIER_OPENING);
    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(account.balanceMinor);
  });

  it('refuses moving a Manual transaction before the opening date', async () => {
    const account = await importedAccount();
    const created = await createManualTransaction(t.ctx, {
      accountId: account.id,
      bookingDate: '2025-10-01',
      amountMinor: -4965,
      description: 'Card fee',
    });

    await expect(
      updateManualTransaction(t.ctx, created.id, {
        bookingDate: '2025-09-30',
        amountMinor: -4965,
        description: 'Card fee',
      }),
    ).rejects.toThrow(EARLIER_OPENING);
  });

  it('accepts the history once the opening date and balance are moved earlier', async () => {
    const account = await importedAccount();
    await updateAccount(t.ctx, account.id, {
      ...accountInput(account),
      openingBalanceMinor: 0,
      openingDate: '2021-01-01',
    });

    await manual(account, '2021-01-04', 850000, 'Opening deposit');
    await manual(account, '2025-09-30', -4965, 'Card fee');

    expect((await getAccount(t.ctx, account.id)).balanceMinor).toBe(
      account.balanceMinor - 845035 + 850000 - 4965,
    );
  });

  it('refuses an opening date after a Transaction already on the Account', async () => {
    const account = await clerAccount({ openingDate: '2021-01-01' });
    await manual(account, '2024-05-02', -1000, 'Bakery');

    await expect(
      updateAccount(t.ctx, account.id, { ...accountInput(account), openingDate: '2024-06-01' }),
    ).rejects.toThrow(
      'The opening date must not be after the earliest Transaction on this Account (2024-05-02)',
    );
  });
});

function accountInput(account: Account): AccountInput {
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

async function manual(
  account: Account,
  bookingDate: string,
  amountMinor: number,
  description: string,
): Promise<void> {
  await createManualTransaction(t.ctx, {
    accountId: account.id,
    bookingDate,
    amountMinor,
    description,
  });
}

function previewUbsOctober(account: Account): ReturnType<typeof previewImport> {
  const content = readFileSync(
    path.join(import.meta.dirname, '../../../../test/fixtures/import/ubs/ubs-chf-2025-10.csv'),
  );
  return previewImport(t.ctx, { accountId: account.id, fileName: 'ubs-chf-2025-10.csv', content });
}

/** The first Transaction of a committed UBS fixture Import. */
async function importedTransaction(): Promise<Transaction> {
  const account = await clerAccount({ importFormat: 'ubs_csv', openingBalanceMinor: 0 });
  const preview = await previewUbsOctober(account);
  const committed = await commitImport(t.ctx, { previewId: preview.id });
  return (await listImportTransactions(t.ctx, committed.id))[0]!;
}
