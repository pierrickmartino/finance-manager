import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { ACCOUNT_KIND_LABELS, IMPORT_FORMAT_LABELS } from '@/server/services/accounts';
import { listAccountBalances, type AccountBalance } from '@/server/services/accounts/balances';
import type { ServiceContext } from '@/server/services/context';
import { ServiceError } from '@/server/services/errors';
import { getRateStatus } from '@/server/services/fx';
import { listBanks } from '@/server/services/banks';
import { AccountForm } from './account-form';
import { createAccountAction } from './actions';
import { RateStatusNotice } from './rate-status';

export const metadata: Metadata = { title: 'Accounts · Finance Manager' };

const CELL = 'px-3 py-2 text-left';
const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

interface AccountsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Balances on the requested date; on an invalid date, today's, with the error to show. */
async function loadBalances(
  ctx: ServiceContext,
  date: string,
): Promise<{ balances: AccountBalance[]; error: string | null }> {
  try {
    return { balances: await listAccountBalances(ctx, { date: date || undefined }), error: null };
  } catch (error: unknown) {
    if (!(error instanceof ServiceError)) throw error;
    return { balances: await listAccountBalances(ctx), error: error.message };
  }
}

function ChfCell({ balance, fmt }: { balance: AccountBalance; fmt: Formatter }) {
  if (!balance.chf) return <span className="text-zinc-500">No FX rate</span>;
  const { amountMinor, rate } = balance.chf;
  return (
    <>
      {fmt.amount(amountMinor, { currency: 'CHF' })}
      {rate.currency !== 'CHF' && (
        <div className="text-xs text-zinc-500">
          at {rate.rateToChf} ({fmt.date(rate.rateDate)})
        </div>
      )}
    </>
  );
}

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const ctx = await getServiceContext();
  const params = await searchParams;
  const requestedDate = typeof params.date === 'string' ? params.date : '';
  const [{ balances, error }, rateStatus, banks, fmt] = await Promise.all([
    loadBalances(ctx, requestedDate),
    getRateStatus(ctx),
    listBanks(ctx),
    getFormatter(),
  ]);
  const shownDate = balances[0]?.date ?? requestedDate;

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Accounts</h1>

      <RateStatusNotice status={rateStatus} fmt={fmt} />

      <form aria-label="Balance date" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>Balances on</span>
          <input type="date" name="date" defaultValue={shownDate} className={INPUT} />
        </label>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Show
        </button>
        {requestedDate && (
          <Link href="/accounts" className="text-sm underline">
            Today
          </Link>
        )}
        {error && <FieldError message={error} />}
      </form>

      {balances.length === 0 ? (
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
                <th className={`${CELL} text-right`}>Balance in CHF</th>
                <th className={CELL}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {balances.map(({ account, ...balance }) => (
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
                    {fmt.amount(balance.balanceMinor, { currency: account.currency })}
                  </td>
                  <td className={`${CELL} text-right tabular-nums`}>
                    <ChfCell balance={{ account, ...balance }} fmt={fmt} />
                  </td>
                  <td className={CELL}>{account.archivedAt ? 'Archived' : 'Active'}</td>
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
