// PROTOTYPE — variant A "Net worth": a CHF total up top with a composition bar, Accounts grouped
// by Kind with subtotals and a 30-day change, archived Accounts and the form tucked away.
import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import { ACCOUNT_KIND_LABELS } from '@/server/services/accounts';
import type { AccountBalance } from '@/server/services/accounts/balances';
import type { Bank } from '@/server/services/banks';
import { AccountForm } from '../account-form';
import { createAccountAction } from '../actions';
import {
  chfOf,
  DateForm,
  Delta,
  KIND_COLOR,
  KIND_ORDER,
  totalChf,
  type AccountsData,
} from './shared';

export const name = 'Net worth';

export function VariantA(data: AccountsData) {
  const { balances, compare, fmt, rateStatus, mismatches } = data;
  const monthAgo = compare.at(-1)!;
  const active = balances.filter((balance) => !balance.account.archivedAt);
  const archived = balances.filter((balance) => balance.account.archivedAt);
  const total = totalChf(balances);
  const totalBefore = totalChf([...monthAgo.byAccount.values()]);
  const mismatched = new Set(mismatches.map((check) => check.accountId));
  const noRate = active.filter((balance) => !balance.chf).length;
  const assets = active.reduce((sum, b) => sum + Math.max(0, chfOf(b) ?? 0), 0);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Net worth on {fmt.date(data.shownDate)}
          </h1>
          <p className="text-4xl font-semibold tabular-nums">
            {fmt.amount(total, { currency: 'CHF' })}
          </p>
          <p className="text-sm">
            <Delta minor={total - totalBefore} fmt={fmt} />{' '}
            <span className="text-zinc-500">in 30 days</span>
            {noRate > 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                {' '}
                · {noRate} Account(s) without an FX rate left out
              </span>
            )}
          </p>
        </div>
        <DateForm data={data} compact />
      </header>

      {(rateStatus.isStale || mismatches.length > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {rateStatus.isStale && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              FX rates stale: {rateStatus.staleReason}
            </span>
          )}
          {mismatches.length > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {mismatches.length} Balance snapshot mismatch(es)
            </span>
          )}
        </div>
      )}

      {assets > 0 && (
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          {KIND_ORDER.map((kind) => {
            const sum = active
              .filter((b) => b.account.kind === kind)
              .reduce((s, b) => s + Math.max(0, chfOf(b) ?? 0), 0);
            if (sum === 0) return null;
            return (
              <div
                key={kind}
                title={`${ACCOUNT_KIND_LABELS[kind]} ${fmt.percent(sum / assets)}`}
                className={KIND_COLOR[kind]}
                style={{ width: `${(sum / assets) * 100}%` }}
              />
            );
          })}
        </div>
      )}

      {KIND_ORDER.map((kind) => {
        const rows = active.filter((balance) => balance.account.kind === kind);
        if (rows.length === 0) return null;
        const subtotal = totalChf(rows);
        return (
          <section key={kind} className={`${CARD_CLASS} overflow-hidden`}>
            <header className="flex items-baseline justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${KIND_COLOR[kind]}`} />
                {ACCOUNT_KIND_LABELS[kind]}
                <span className="text-sm font-normal text-zinc-500">{rows.length}</span>
              </h2>
              <span className="font-semibold tabular-nums">
                {fmt.amount(subtotal, { currency: 'CHF' })}
                {kind !== 'loan' && assets > 0 && (
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    {fmt.percent(subtotal / assets)} of assets
                  </span>
                )}
              </span>
            </header>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((balance) => (
                <Row
                  key={balance.account.id}
                  balance={balance}
                  before={monthAgo.byAccount.get(balance.account.id)}
                  isMismatch={mismatched.has(balance.account.id)}
                  data={data}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {balances.length === 0 && <p className="text-sm text-zinc-500">No Accounts yet.</p>}

      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">Archived ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-zinc-100 text-zinc-500 dark:divide-zinc-800">
            {archived.map((balance) => (
              <Row key={balance.account.id} balance={balance} data={data} />
            ))}
          </ul>
        </details>
      )}

      <NewAccount banks={data.banks} />

      <p className="text-xs text-zinc-500">
        {rateStatus.lastFetchedAt
          ? `FX rates last fetched ${fmt.dateTime(rateStatus.lastFetchedAt)}`
          : 'FX rates have never been fetched'}
      </p>
    </section>
  );
}

function Row({
  balance,
  before,
  isMismatch = false,
  data,
}: {
  balance: AccountBalance;
  before?: AccountBalance;
  isMismatch?: boolean;
  data: AccountsData;
}) {
  const { account } = balance;
  const { fmt } = data;
  const chf = chfOf(balance);
  const was = chfOf(before);
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/accounts/${account.id}`} className="font-medium hover:underline">
          {account.name}
        </Link>
        {isMismatch && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            mismatch
          </span>
        )}
        <div className="truncate text-xs text-zinc-500">
          {account.bankName}
          {account.iban && <span className="font-mono"> · {account.iban}</span>}
        </div>
      </div>
      <div className="w-28 text-right text-xs">
        {before && <Delta minor={chf !== null && was !== null ? chf - was : null} fmt={fmt} />}
      </div>
      <div className="w-40 text-right tabular-nums">
        <div className="font-medium">
          {fmt.amount(balance.balanceMinor, { currency: account.currency })}
        </div>
        {account.currency !== 'CHF' && (
          <div className="text-xs text-zinc-500">
            {chf === null ? 'No FX rate' : fmt.amount(chf, { currency: 'CHF' })}
          </div>
        )}
        {balance.snapshotDate && (
          <div className="text-xs text-zinc-500">snapshot {fmt.date(balance.snapshotDate)}</div>
        )}
      </div>
    </li>
  );
}

function NewAccount({ banks }: { banks: Bank[] }) {
  return (
    <details className={`${CARD_CLASS} px-4 py-3`}>
      <summary className="cursor-pointer font-medium">+ New Account</summary>
      <div className="mt-3">
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
      </div>
    </details>
  );
}
