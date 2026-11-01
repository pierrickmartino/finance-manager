// PROTOTYPE — variant B "By Bank": master / detail like Rules and Unclassified. Accounts grouped
// by Bank on the left; the selected one (?account=, else the first) in full on the right, with
// its balance over time and its snapshot warnings. "New Account" is a list entry (?account=new).
import Link from 'next/link';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import { ACCOUNT_KIND_LABELS, IMPORT_FORMAT_LABELS } from '@/server/services/accounts';
import type { AccountBalance } from '@/server/services/accounts/balances';
import { AccountForm } from '../account-form';
import { createAccountAction } from '../actions';
import { describeMismatch } from '../snapshot-mismatches';
import { chfOf, DateForm, Delta, totalChf, type AccountsData } from './shared';

export const name = 'By Bank';

function href(data: AccountsData, account: string): string {
  const search = new URLSearchParams({ variant: 'B', account });
  if (data.requestedDate) search.set('date', data.requestedDate);
  return `/accounts?${search.toString()}`;
}

export function VariantB(data: AccountsData) {
  const { balances, fmt, mismatches } = data;
  const requested = data.params.account;
  const isNew = requested === 'new';
  const selected = isNew
    ? undefined
    : (balances.find((b) => b.account.id === requested) ?? balances[0]);
  const mismatched = new Set(mismatches.map((check) => check.accountId));
  const byBank = new Map<string, AccountBalance[]>();
  for (const balance of balances) {
    byBank.set(balance.account.bankName, [
      ...(byBank.get(balance.account.bankName) ?? []),
      balance,
    ]);
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <span className="text-zinc-500 tabular-nums">
            {fmt.amount(totalChf(balances), { currency: 'CHF' })}
          </span>
        </div>
        <DateForm data={data} />
      </header>
      {data.rateStatus.isStale && (
        <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">
          FX rates are stale: {data.rateStatus.staleReason}. CHF values may be out of date.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(16rem,22rem)_1fr]">
        <nav aria-label="Accounts" className={`${CARD_CLASS} flex flex-col p-2`}>
          {[...byBank].map(([bank, rows]) => (
            <div key={bank} className="flex flex-col">
              <div className="flex justify-between px-2 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <span>{bank}</span>
                <span className="tabular-nums">
                  {fmt.amount(totalChf(rows), { currency: 'CHF' })}
                </span>
              </div>
              {rows.map((balance) => {
                const { account } = balance;
                const isSelected = selected?.account.id === account.id;
                return (
                  <Link
                    key={account.id}
                    href={href(data, account.id)}
                    scroll={false}
                    className={`flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm ${
                      isSelected
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    } ${account.archivedAt ? 'opacity-50' : ''}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {mismatched.has(account.id) && (
                        <span
                          title="Snapshot mismatch"
                          className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        />
                      )}
                      <span className="truncate">{account.name}</span>
                    </span>
                    <span className="tabular-nums">
                      {fmt.amount(balance.balanceMinor, { currency: account.currency })}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
          <Link
            href={href(data, 'new')}
            scroll={false}
            className={`mt-3 rounded-md border border-dashed border-zinc-300 px-2 py-2 text-center text-sm dark:border-zinc-700 ${
              isNew ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            + New Account
          </Link>
        </nav>

        <div className={`${CARD_CLASS} p-5`}>
          {isNew ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">New Account</h2>
              {data.banks.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Create a{' '}
                  <Link href="/banks" className="underline">
                    Bank
                  </Link>{' '}
                  first.
                </p>
              ) : (
                <AccountForm
                  banks={data.banks}
                  action={createAccountAction}
                  submitLabel="Add Account"
                />
              )}
            </div>
          ) : selected ? (
            <Detail balance={selected} data={data} />
          ) : (
            <p className="text-sm text-zinc-500">No Accounts yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Detail({ balance, data }: { balance: AccountBalance; data: AccountsData }) {
  const { account } = balance;
  const { fmt } = data;
  const own = data.mismatches.filter((check) => check.accountId === account.id);
  const facts: [string, string][] = [
    ['Bank', account.bankName],
    ['Kind', ACCOUNT_KIND_LABELS[account.kind]],
    ['Currency', account.currency],
    ['IBAN', account.iban ?? '—'],
    [
      'Import format',
      account.importFormat ? IMPORT_FORMAT_LABELS[account.importFormat] : 'None (manual)',
    ],
    ['Status', account.archivedAt ? `Archived ${fmt.date(account.archivedAt)}` : 'Active'],
  ];
  const history = [
    ...data.compare.map((c) => ({
      label: c.label,
      date: c.date,
      balance: c.byAccount.get(account.id),
    })),
    { label: 'Shown date', date: balance.date, balance },
  ];
  const chfNow = chfOf(balance);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{account.name}</h2>
          <p className="text-3xl font-semibold tabular-nums">
            {fmt.amount(balance.balanceMinor, { currency: account.currency })}
          </p>
          {balance.chf && account.currency !== 'CHF' && (
            <p className="text-sm text-zinc-500 tabular-nums">
              {fmt.amount(balance.chf.amountMinor, { currency: 'CHF' })} at{' '}
              {balance.chf.rate.rateToChf} ({fmt.date(balance.chf.rate.rateDate)})
            </p>
          )}
          {!balance.chf && <p className="text-sm text-zinc-500">No FX rate</p>}
          {balance.snapshotDate && (
            <p className="text-sm text-zinc-500">
              From the Balance snapshot of {fmt.date(balance.snapshotDate)}
            </p>
          )}
        </div>
        <Link href={`/accounts/${account.id}`} className={PRIMARY_BUTTON_CLASS}>
          Open Account →
        </Link>
      </div>

      {own.length > 0 && (
        <ul
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {own.map((check) => (
            <li key={check.id}>{describeMismatch(check, account.currency, fmt)}</li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-zinc-500">{label}</dt>
            <dd className={label === 'IBAN' ? 'font-mono' : 'font-medium'}>{value}</dd>
          </div>
        ))}
      </dl>

      <table className="w-full text-sm">
        <caption className="pb-2 text-left font-semibold">Balance over time</caption>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {history.map((row) => {
            const chf = chfOf(row.balance);
            return (
              <tr key={row.label}>
                <td className="py-1.5">{row.label}</td>
                <td className="py-1.5 text-zinc-500">{fmt.date(row.date)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {row.balance
                    ? fmt.amount(row.balance.balanceMinor, { currency: account.currency })
                    : '—'}
                </td>
                <td className="py-1.5 text-right text-xs">
                  <Delta minor={chf !== null && chfNow !== null ? chfNow - chf : null} fmt={fmt} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
