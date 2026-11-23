import type { ServiceContext } from '../../src/server/services/context';
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
