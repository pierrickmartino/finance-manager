import type { RecentTransactions } from '@/server/services/analytics';
import { daysBetween } from '@/server/services/fx/dates';
import {
  RecentActivityCard,
  type RecentActivity,
} from '../dashboards/(dashboard)/[id]/overview/overview-row';
import { categoryText, transactionName } from '../transactions/transaction-display';

export const RECENT_TRANSACTIONS = 'Recent transactions';

interface RecentTransactionsSectionProps {
  recent: Promise<RecentTransactions>;
  /** Today's Swiss date, which "how long ago" counts from. */
  today: string;
}

/**
 * Analytics' Recent transactions, once they arrive, drawn as the Dashboard's recent activity
 * card: the largest in the spotlight, the rest on a timeline, each opening its Transaction.
 */
export async function RecentTransactionsSection({ recent, today }: RecentTransactionsSectionProps) {
  const activity: RecentActivity[] = (await recent).map((transaction) => ({
    id: transaction.id,
    name: transactionName(transaction),
    category: categoryText(transaction),
    bookingDate: transaction.bookingDate,
    daysAgo: daysBetween(transaction.bookingDate, today),
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
  }));
  return <RecentActivityCard recent={activity} title={RECENT_TRANSACTIONS} />;
}
