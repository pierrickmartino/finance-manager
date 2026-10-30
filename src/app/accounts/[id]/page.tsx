import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { getAccount, type Account } from '@/server/services/accounts';
import { listBanks } from '@/server/services/banks';
import { NotFoundError } from '@/server/services/errors';
import { AccountForm } from '../account-form';
import { archiveAccountAction, updateAccountAction } from '../actions';
import { ArchiveAccountButton } from './archive-account-button';

export const metadata: Metadata = { title: 'Account · Finance Manager' };

interface AccountPageProps {
  params: Promise<{ id: string }>;
}

async function loadAccount(id: string): Promise<Account> {
  try {
    return await getAccount(await getServiceContext(), id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { id } = await params;
  const account = await loadAccount(id);
  const [banks, fmt] = await Promise.all([listBanks(await getServiceContext()), getFormatter()]);
  const historyHref = `/history?entityType=account&entityId=${encodeURIComponent(account.id)}`;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/accounts" className="text-sm text-zinc-500 hover:underline">
          ← Accounts
        </Link>
        <h1 className="text-2xl font-semibold">{account.name}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {account.bankName} · Balance{' '}
          <span className="tabular-nums">
            {fmt.amount(account.balanceMinor, { currency: account.currency })}
          </span>
          {account.archivedAt && <> · Archived on {fmt.date(account.archivedAt)}</>}
        </p>
        <Link href={historyHref} className="text-sm underline">
          History of this Account
        </Link>
      </div>

      <AccountForm
        key={JSON.stringify(account)}
        banks={banks}
        account={account}
        action={updateAccountAction.bind(null, account.id)}
        submitLabel="Save"
      />

      {!account.archivedAt && (
        <ArchiveAccountButton action={archiveAccountAction.bind(null, account.id)} />
      )}
    </section>
  );
}
