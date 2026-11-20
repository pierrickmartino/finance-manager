import Link from 'next/link';
import type { RecentTransactions } from '@/server/services/analytics';
import { daysBetween } from '@/server/services/fx/dates';
import {
  RecentActivityList,
  type RecentActivity,
} from '../dashboards/(dashboard)/[id]/overview/overview-row';
import { categoryText, transactionName } from '../transactions/transaction-display';
import { SectionCard } from './section';

export const RECENT_TRANSACTIONS = 'Recent transactions';

interface RecentTransactionsSectionProps {
  recent: Promise<RecentTransactions>;
  /** Today's Swiss date, which "how long ago" counts from. */
  today: string;
  className?: string;
}

/**
 * Analytics' Recent transactions, once they arrive: the Dashboard's recent activity (the largest
 * in the spotlight, the rest on a timeline), each opening its Transaction detail.
 */
export async function RecentTransactionsSection({
  recent,
  today,
  className,
}: RecentTransactionsSectionProps) {
  const activity: RecentActivity[] = (await recent).map((transaction) => ({
    id: transaction.id,
    name: transactionName(transaction),
    category: categoryText(transaction),
    bookingDate: transaction.bookingDate,
    daysAgo: daysBetween(transaction.bookingDate, today),
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
  }));
  return (
    <SectionCard name={RECENT_TRANSACTIONS} className={className}>
      <div>
        <RecentActivityList recent={activity} />
      </div>
      {activity.length > 0 && (
        <Link href="/transactions" className="mt-auto text-sm text-muted hover:text-ink">
          View all Transactions
        </Link>
      )}
    </SectionCard>
  );
}
