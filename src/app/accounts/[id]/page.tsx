import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { swissToday } from '@/server/services/fx/dates';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { getAccount, IMPORT_FORMAT_LABELS, type Account } from '@/server/services/accounts';
import { listBalanceSnapshots } from '@/server/services/balance-snapshots';
import { listBanks } from '@/server/services/banks';
import { NotFoundError } from '@/server/services/errors';
import { listImports } from '@/server/services/imports';
import { listManualTransactions } from '@/server/services/transactions/manual';
import { previewImportAction } from '../../imports/actions';
import { ImportFileForm } from '../../imports/import-file-form';
import { ImportsTable } from '../../imports/imports-table';
import { AccountForm } from '../account-form';
import { archiveAccountAction, updateAccountAction } from '../actions';
import { SnapshotMismatches } from '../snapshot-mismatches';
import { ArchiveAccountButton } from './archive-account-button';
import { BalanceSnapshotsSection } from './balance-snapshots-section';
import { ManualTransactionsSection } from './manual-transactions-section';

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
  const ctx = await getServiceContext();
  const [banks, imports, manualTransactions, snapshots, fmt] = await Promise.all([
    listBanks(ctx),
    listImports(ctx, account.id),
    listManualTransactions(ctx, account.id),
    listBalanceSnapshots(ctx, account.id),
    getFormatter(),
  ]);
  const mismatches = snapshots.filter((check) => check.isMismatch);
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
          {account.balanceSnapshotDate && (
            <> (Balance snapshot of {fmt.date(account.balanceSnapshotDate)})</>
          )}
          {account.archivedAt && <> · Archived on {fmt.date(account.archivedAt)}</>}
        </p>
        <Link href={historyHref} className="text-sm underline">
          History of this Account
        </Link>
      </div>

      <SnapshotMismatches mismatches={mismatches} accounts={[account]} fmt={fmt} />

      {account.importFormat && !account.archivedAt && (
        <section aria-labelledby="import-file" className="flex flex-col gap-3">
          <h2 id="import-file" className="text-lg font-semibold">
            Import a file
          </h2>
          <ImportFileForm
            formatLabel={IMPORT_FORMAT_LABELS[account.importFormat]}
            action={previewImportAction.bind(null, account.id)}
          />
        </section>
      )}

      <section aria-labelledby="imports" className="flex flex-col gap-3">
        <h2 id="imports" className="text-lg font-semibold">
          Imports
        </h2>
        <ImportsTable imports={imports} fmt={fmt} />
      </section>

      <ManualTransactionsSection
        account={account}
        transactions={manualTransactions}
        fmt={fmt}
        today={swissToday()}
      />

      <BalanceSnapshotsSection account={account} snapshots={snapshots} fmt={fmt} />

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
