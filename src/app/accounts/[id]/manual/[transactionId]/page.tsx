import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { getAccount } from '@/server/services/accounts';
import { NotFoundError } from '@/server/services/errors';
import { getManualTransaction } from '@/server/services/transactions/manual';
import { deleteManualTransactionAction, updateManualTransactionAction } from '../../actions';
import { ConfirmActionButton } from '@/app/imports/confirm-action-button';
import { ManualTransactionForm } from '../../manual-transaction-form';
import { PAGE_TITLE_CLASS } from '@/components/surface';

export const metadata: Metadata = { title: 'Manual transaction · Finance Manager' };

interface ManualTransactionPageProps {
  params: Promise<{ id: string; transactionId: string }>;
}

export default async function ManualTransactionPage({ params }: ManualTransactionPageProps) {
  const { id, transactionId } = await params;
  const ctx = await getServiceContext();
  const loaded = await Promise.all([
    getAccount(ctx, id),
    getManualTransaction(ctx, transactionId),
  ]).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [account, transaction] = loaded;
  if (transaction.accountId !== account.id) notFound();
  const fmt = await getFormatter();
  const historyHref = `/history?entityType=transaction&entityId=${encodeURIComponent(transaction.id)}`;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/accounts/${account.id}`} className="text-sm text-muted hover:underline">
          ← {account.name}
        </Link>
        <h1 className={PAGE_TITLE_CLASS}>Manual transaction</h1>
        <p className="text-sm text-ink-soft">
          {transaction.rawDescription} · {fmt.date(transaction.bookingDate)} ·{' '}
          <span className="tabular-nums">
            {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
          </span>
        </p>
        <Link href={historyHref} className="text-sm underline">
          History of this Transaction
        </Link>
      </div>

      <ManualTransactionForm
        action={updateManualTransactionAction.bind(null, account.id, transaction.id)}
        currency={account.currency}
        submitLabel="Save"
        transaction={transaction}
      />

      <div className="border-t border-rule pt-4">
        <ConfirmActionButton
          label="Delete Manual transaction"
          ariaLabel="Delete this Manual transaction"
          confirmMessage="Delete this Manual transaction? Its History is kept."
          action={deleteManualTransactionAction.bind(null, account.id, transaction.id)}
        />
      </div>
    </section>
  );
}
