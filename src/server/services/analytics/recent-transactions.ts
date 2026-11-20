import type { ServiceContext } from '../context';
import { listTransactions, type TransactionListItem } from '../transactions';

/**
 * Analytics' Recent transactions: the latest Transactions, newest first, as the Dashboard's
 * recent activity lists them. They don't depend on the Period view: the latest activity shows
 * whatever the window.
 */

/** How many Transactions Recent transactions lists (the Dashboard's count). */
export const RECENT_TRANSACTION_COUNT = 6;

export type RecentTransactions = TransactionListItem[];

export async function recentTransactions(ctx: ServiceContext): Promise<RecentTransactions> {
  const page = await listTransactions(ctx, { pageSize: RECENT_TRANSACTION_COUNT });
  return page.transactions;
}
