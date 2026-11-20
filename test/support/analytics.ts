import { vi } from 'vitest';
import { createAccount, type Account } from '@/server/services/accounts';
import { createBank } from '@/server/services/banks';
import type { ServiceContext } from '@/server/services/context';
import { editClassification, type ClassificationChanges } from '@/server/services/transactions';
import { seedTransactions, type SeedTransaction } from './transactions';

/**
 * Shared seeding for the Analytics service's tests (src/server/services/analytics): an Account
 * per Bank, and Transactions classified as they are seeded. Each section's test file builds its
 * own dataset from these.
 */

/** Fixes "today" (the Swiss date the reporting engine reads) for the rest of the test. */
export function fixToday(date: string): void {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${date}T09:00:00Z`) });
}

/** A current Account at its own Bank, with no opening balance. */
export async function seedAccount(
  ctx: ServiceContext,
  name: string,
  currency = 'CHF',
): Promise<Account> {
  const bank = await createBank(ctx, { name: `Bank ${name}` });
  return createAccount(ctx, {
    bankId: bank.id,
    name,
    currency,
    iban: null,
    kind: 'current',
    importFormat: 'ubs_csv',
    openingBalanceMinor: 0,
  });
}

export interface ClassifiedRow extends SeedTransaction {
  classify?: ClassificationChanges;
}

/** Seeds Transactions and classifies the ones that say how. Returns their ids in order. */
export async function seedClassified(
  ctx: ServiceContext,
  on: Account,
  rows: ClassifiedRow[],
): Promise<string[]> {
  const ids = await seedTransactions(ctx.db, on, rows);
  for (const [index, row] of rows.entries()) {
    if (row.classify) await editClassification(ctx, ids[index]!, row.classify);
  }
  return ids;
}
