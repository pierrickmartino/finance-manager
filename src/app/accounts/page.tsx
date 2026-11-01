import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listAccountBalances, type AccountBalance } from '@/server/services/accounts/balances';
import { listSnapshotMismatches } from '@/server/services/balance-snapshots';
import { listBanks } from '@/server/services/banks';
import type { ServiceContext } from '@/server/services/context';
import { ServiceError } from '@/server/services/errors';
import { getRateStatus } from '@/server/services/fx';
import { AccountDetail, type EarlierBalance } from './account-detail';
import { AccountList } from './account-list';
import { NewAccountPanel } from './new-account-panel';
import { RateStatusNotice } from './rate-status';
import { SnapshotMismatches } from './snapshot-mismatches';
import { accountsHref, balanceDates, NEW_ACCOUNT, selectAccount, totalChfMinor } from './view';

export const metadata: Metadata = { title: 'Accounts · Finance Manager' };

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900';

interface AccountsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const param = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

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

/** The Account's balance on each of the earlier dates the detail pane compares with. */
async function loadEarlier(
  ctx: ServiceContext,
  accountId: string,
  date: string,
): Promise<EarlierBalance[]> {
  return Promise.all(
    balanceDates(date).map(async ({ label, date: on }) => {
      const balances = await listAccountBalances(ctx, { date: on });
      return { label, date: on, balance: balances.find((b) => b.account.id === accountId) };
    }),
  );
}

/**
 * Accounts (story 95, spec 43) as master / detail: the Accounts grouped by Bank on the left,
 * the selected one (`?account=`, else the first; `new` for the New Account form) on the right.
 * Balances are on `?date=`, today by default.
 */
export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const ctx = await getServiceContext();
  const params = await searchParams;
  const requestedDate = param(params.date) ?? '';
  const [{ balances, error }, rateStatus, banks, mismatches, fmt] = await Promise.all([
    loadBalances(ctx, requestedDate),
    getRateStatus(ctx),
    listBanks(ctx),
    listSnapshotMismatches(ctx),
    getFormatter(),
  ]);
  const shownDate = balances[0]?.date ?? requestedDate;
  const selection = selectAccount(balances, param(params.account));
  const selected = selection.type === 'new' ? NEW_ACCOUNT : selection.row.account.id;
  const earlier = selection.type === 'account' ? await loadEarlier(ctx, selected, shownDate) : [];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Accounts</h1>
          {balances.length > 0 && <Total balances={balances} fmt={fmt} />}
        </div>
        <DateForm
          shownDate={shownDate}
          requestedDate={requestedDate}
          selected={selection.type === 'account' ? selected : undefined}
          error={error}
        />
      </header>

      <RateStatusNotice status={rateStatus} fmt={fmt} />

      <SnapshotMismatches
        mismatches={mismatches}
        accounts={balances.map((balance) => balance.account)}
        fmt={fmt}
        showAccountNames
      />

      <div className="grid items-start gap-6 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        {balances.length > 0 ? (
          <AccountList
            balances={balances}
            selected={selected}
            date={requestedDate}
            mismatchedAccounts={new Set(mismatches.map((check) => check.accountId))}
            fmt={fmt}
          />
        ) : (
          <p className="text-sm text-zinc-500">No Accounts yet.</p>
        )}
        {selection.type === 'account' ? (
          <AccountDetail key={selected} balance={selection.row} earlier={earlier} fmt={fmt} />
        ) : banks.length > 0 ? (
          <NewAccountPanel banks={banks} date={requestedDate} />
        ) : (
          <p className={`${CARD_CLASS} p-5 text-sm text-zinc-500`}>
            Create a{' '}
            <Link href="/banks" className="underline">
              Bank
            </Link>{' '}
            first, then add its Accounts here.
          </p>
        )}
      </div>
    </section>
  );
}

/** The CHF total of the active Accounts, saying which ones it leaves out. */
function Total({ balances, fmt }: { balances: AccountBalance[]; fmt: Formatter }) {
  const { amountMinor, missingRates } = totalChfMinor(balances);
  return (
    <p className="text-sm text-zinc-500">
      Total{' '}
      <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
        {fmt.amount(amountMinor, { currency: 'CHF' })}
      </span>
      {missingRates > 0 &&
        ` · ${missingRates} Account${missingRates === 1 ? '' : 's'} without an FX rate left out`}
    </p>
  );
}

interface DateFormProps {
  shownDate: string;
  requestedDate: string;
  selected: string | undefined;
  error: string | null;
}

/** The `?date=` picker; it keeps the selected Account. */
function DateForm({ shownDate, requestedDate, selected, error }: DateFormProps) {
  return (
    <form aria-label="Balance date" className="flex flex-wrap items-center gap-2 text-sm">
      {selected && <input type="hidden" name="account" value={selected} />}
      <label className="flex items-center gap-2">
        <span className="text-zinc-500">Balances on</span>
        <input type="date" name="date" defaultValue={shownDate} className={INPUT} />
      </label>
      <button
        type="submit"
        className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
      >
        Show
      </button>
      {requestedDate && (
        <Link href={accountsHref({ account: selected })} className="underline">
          Today
        </Link>
      )}
      {error && <FieldError message={error} />}
    </form>
  );
}
