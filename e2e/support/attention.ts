import { archiveAccount } from '../../src/server/services/accounts';
import { checkCompleteness } from '../../src/server/services/completeness';
import type { ServiceContext } from '../../src/server/services/context';
import { swissToday } from '../../src/server/services/fx/dates';
import {
  editClassification,
  listTransactions,
  MAX_PAGE_SIZE,
  splitTransaction,
} from '../../src/server/services/transactions';

const MAX_PASSES = 50;

/**
 * Gives every Unclassified Transaction, and every Unclassified Split line, `categoryId`, so the
 * shared E2E database has nothing Unclassified left (for the bell's empty state).
 */
export async function classifyEverything(ctx: ServiceContext, categoryId: string): Promise<void> {
  // A page at a time; bounded, so a Transaction that stays Unclassified fails instead of looping.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { transactions } = await listTransactions(ctx, {
      unclassified: true,
      pageSize: MAX_PAGE_SIZE,
    });
    if (transactions.length === 0) return;
    for (const transaction of transactions) {
      if (transaction.splitLines.length === 0) {
        await editClassification(ctx, transaction.id, { categoryId });
        continue;
      }
      await splitTransaction(
        ctx,
        transaction.id,
        transaction.splitLines.map((line) => ({
          id: line.id,
          amountMinor: line.amountMinor,
          categoryId: line.transferId ? null : (line.category?.id ?? categoryId),
          payeeId: line.payee?.id ?? null,
          tagIds: line.tags.map((tag) => tag.id),
          note: line.note,
        })),
      );
    }
  }
  throw new Error('Transactions are still Unclassified');
}

/**
 * Archives every Account the Completeness check lists now, so a test controls every checked
 * Account (and the bell has no Completeness item): the E2E database is shared by the run, and
 * earlier specs leave imported Accounts whose data is Stale by now. Returns their ids, for
 * `restoreAccounts`.
 */
export async function setAsideCheckedAccounts(ctx: ServiceContext): Promise<string[]> {
  const entries = await checkCompleteness(ctx, { today: swissToday() });
  const ids = entries.map((entry) => entry.account.id);
  for (const id of ids) await archiveAccount(ctx, id);
  return ids;
}

/**
 * Un-archives the Accounts `setAsideCheckedAccounts` archived, leaving other specs' data as it
 * found it. No service un-archives an Account, so this clean-up is SQL.
 */
export async function restoreAccounts(ctx: ServiceContext, ids: string[]): Promise<void> {
  await ctx.db.query('UPDATE account SET archived_at = NULL WHERE id = ANY($1::uuid[])', [ids]);
}
