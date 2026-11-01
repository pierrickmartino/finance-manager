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
import { listSnapshotMismatches } from '@/server/services/balance-snapshots';
import { listBanks } from '@/server/services/banks';
import { AccountForm } from './account-form';
import { createAccountAction } from './actions';
import { RateStatusNotice } from './rate-status';
import { SnapshotMismatches } from './snapshot-mismatches';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { shiftDays, yearEnd, type BalancesOn } from './_prototype/shared';
import { VariantA, name as nameA } from './_prototype/variant-a-net-worth';
import { VariantB, name as nameB } from './_prototype/variant-b-by-bank';
import { VariantC, name as nameC } from './_prototype/variant-c-over-time';

// PROTOTYPE — three Accounts page layouts on /accounts, switchable via ?variant= (A, B, C;
// default "current" is today's page) and a floating bar. The switch and the bar are disabled in
// production builds. Not for main: fold the winner in, then drop `_prototype/` and the bar.
const VARIANTS = [
  { key: 'current', name: 'Today' },
  { key: 'A', name: nameA },
  { key: 'B', name: nameB },
  { key: 'C', name: nameC },
];

/** PROTOTYPE — balances at earlier dates, for the variants' changes over time. */
async function loadCompare(ctx: ServiceContext, date: string): Promise<BalancesOn[]> {
  const dates = [
    { label: 'End of last year', date: yearEnd(date) },
    { label: '90 days before', date: shiftDays(date, -90) },
    { label: '30 days before', date: shiftDays(date, -30) },
  ];
  return Promise.all(
    dates.map(async ({ label, date: on }) => {
      const balances = await listAccountBalances(ctx, { date: on });
      return { label, date: on, byAccount: new Map(balances.map((b) => [b.account.id, b])) };
    }),
  );
}

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
  const [{ balances, error }, rateStatus, banks, mismatches, fmt] = await Promise.all([
    loadBalances(ctx, requestedDate),
    getRateStatus(ctx),
    listBanks(ctx),
    listSnapshotMismatches(ctx),
    getFormatter(),
  ]);
  const shownDate = balances[0]?.date ?? requestedDate;
  const mismatchedAccounts = new Set(mismatches.map((check) => check.accountId));

  const requestedVariant = typeof params.variant === 'string' ? params.variant : undefined;
  const variant =
    process.env.NODE_ENV !== 'production' && VARIANTS.some((v) => v.key === requestedVariant)
      ? requestedVariant!
      : 'current';
  const switcher = (
    <PrototypeSwitcher
      variants={VARIANTS}
      current={variant}
      resetParams={['account', 'new', 'archived']}
    />
  );
  if (variant !== 'current' && shownDate) {
    const data = {
      balances,
      compare: await loadCompare(ctx, shownDate),
      rateStatus,
      mismatches,
      banks,
      fmt,
      shownDate,
      requestedDate,
      error,
      params: Object.fromEntries(
        Object.entries(params).map(([key, value]) => [
          key,
          typeof value === 'string' ? value : undefined,
        ]),
      ),
    };
    return (
      <>
        {variant === 'A' && <VariantA {...data} />}
        {variant === 'B' && <VariantB {...data} />}
        {variant === 'C' && <VariantC {...data} />}
        {switcher}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Accounts</h1>

      <RateStatusNotice status={rateStatus} fmt={fmt} />

      <SnapshotMismatches
        mismatches={mismatches}
        accounts={balances.map((balance) => balance.account)}
        fmt={fmt}
        showAccountNames
      />

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
                    {balance.snapshotDate && (
                      <div className="text-xs text-zinc-500">
                        Balance snapshot of {fmt.date(balance.snapshotDate)}
                      </div>
                    )}
                  </td>
                  <td className={`${CELL} text-right tabular-nums`}>
                    <ChfCell balance={{ account, ...balance }} fmt={fmt} />
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
      {switcher}
    </section>
  );
}
