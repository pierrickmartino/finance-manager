import type { Metadata } from 'next';
import Link from 'next/link';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import {
  ACCOUNT_KIND_LABELS,
  IMPORT_FORMAT_LABELS,
  listAccounts,
} from '@/server/services/accounts';
import { listSnapshotMismatches } from '@/server/services/balance-snapshots';
import { listBanks } from '@/server/services/banks';
import { AccountForm } from './account-form';
import { createAccountAction } from './actions';
import { SnapshotMismatches } from './snapshot-mismatches';

export const metadata: Metadata = { title: 'Accounts · Finance Manager' };

const CELL = 'px-3 py-2 text-left';

export default async function AccountsPage() {
  const ctx = await getServiceContext();
  const [accounts, banks, mismatches, fmt] = await Promise.all([
    listAccounts(ctx),
    listBanks(ctx),
    listSnapshotMismatches(ctx),
    getFormatter(),
  ]);
  const mismatchedAccounts = new Set(mismatches.map((check) => check.accountId));

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Accounts</h1>

      <SnapshotMismatches mismatches={mismatches} accounts={accounts} fmt={fmt} showAccountNames />

      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">No Accounts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Accounts" className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={CELL}>Account</th>
                <th className={CELL}>Bank</th>
                <th className={CELL}>Kind</th>
                <th className={CELL}>Import format</th>
                <th className={`${CELL} text-right`}>Balance</th>
                <th className={CELL}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {accounts.map((account) => (
                <tr key={account.id} className={account.archivedAt ? 'text-zinc-500' : undefined}>
                  <td className={CELL}>
                    <Link href={`/accounts/${account.id}`} className="font-medium hover:underline">
                      {account.name}
                    </Link>
                    {account.iban && (
                      <div className="font-mono text-xs text-zinc-500">{account.iban}</div>
                    )}
                  </td>
                  <td className={CELL}>{account.bankName}</td>
                  <td className={CELL}>{ACCOUNT_KIND_LABELS[account.kind]}</td>
                  <td className={CELL}>
                    {account.importFormat ? IMPORT_FORMAT_LABELS[account.importFormat] : 'None'}
                  </td>
                  <td className={`${CELL} text-right tabular-nums`}>
                    {fmt.amount(account.balanceMinor, { currency: account.currency })}
                    {account.balanceSnapshotDate && (
                      <div className="text-xs text-zinc-500">
                        Balance snapshot of {fmt.date(account.balanceSnapshotDate)}
                      </div>
                    )}
                  </td>
                  <td className={CELL}>
                    {account.archivedAt ? 'Archived' : 'Active'}
                    {mismatchedAccounts.has(account.id) && (
                      <div className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Snapshot mismatch
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section aria-labelledby="new-account" className="flex flex-col gap-3">
        <h2 id="new-account" className="text-lg font-semibold">
          New Account
        </h2>
        {banks.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Create a{' '}
            <Link href="/banks" className="underline">
              Bank
            </Link>{' '}
            first.
          </p>
        ) : (
          <AccountForm banks={banks} action={createAccountAction} submitLabel="Add Account" />
        )}
      </section>
    </section>
  );
}
