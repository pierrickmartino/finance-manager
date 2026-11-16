import type { ServiceContext } from '@/server/services/context';
import { ValidationError } from '@/server/services/errors';
import { locateTransaction, type TransactionPlace } from '@/server/services/transactions';
import type { TransactionSearch } from '../search';

/**
 * Where the Transaction `id` sits in the Transactions list its detail was opened from
 * (`listSearch`, ADR-0013). Null with no list, or with one whose filters don't read or validate:
 * the detail then shows no Previous and Next, and "← Transactions" opens the list's first page.
 */
export async function locateInList(
  ctx: ServiceContext,
  listSearch: TransactionSearch | null,
  id: string,
): Promise<TransactionPlace | null> {
  if (!listSearch?.query) return null;
  try {
    return await locateTransaction(ctx, listSearch.query, id);
  } catch (error: unknown) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
}
