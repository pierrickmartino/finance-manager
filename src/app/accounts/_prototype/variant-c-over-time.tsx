// PROTOTYPE — variant C "Over time": what needs attention first (stale rates, mismatches, missing
// rates), quick period-end date chips, then one dense matrix of every Account's CHF value at
// the end of last year, 90 and 30 days back and the shown date, with the change since year end.
import Link from 'next/link';
import { GHOST_BUTTON_CLASS } from '@/components/surface';
import { ACCOUNT_KIND_LABELS } from '@/server/services/accounts';
import { swissToday } from '@/server/services/fx/dates';
import { AccountForm } from '../account-form';
import { createAccountAction } from '../actions';
import {
  chfOf,
  DateForm,
  Delta,
  KIND_COLOR,
  monthEnd,
  quarterEnd,
  totalChf,
  yearEnd,
  type AccountsData,
} from './shared';

export const name = 'Over time';

const CELL = 'px-3 py-2 text-right tabular-nums';

function href(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams({ variant: 'C' });
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `/accounts?${search.toString()}`;
}

export function VariantC(data: AccountsData) {
  const { balances, compare, fmt, rateStatus, mismatches } = data;
  const today = swissToday();
  const showArchived = data.params.archived === '1';
  const showNew = data.params.new === '1';
  const rows = balances.filter((b) => showArchived || !b.account.archivedAt);
  const noRate = balances.filter((b) => !b.account.archivedAt && !b.chf);
  const yearStart = compare[0]!;
  const changes = rows.map((b) => {
    const now = chfOf(b);
    const then = chfOf(yearStart.byAccount.get(b.account.id));
    return now !== null && then !== null ? now - then : null;
  });
  const maxChange = Math.max(1, ...changes.map((c) => Math.abs(c ?? 0)));

  const attention = [
    rateStatus.isStale && { tone: 'amber', text: `FX rates are stale: ${rateStatus.staleReason}` },
    rateStatus.lastError && { tone: 'red', text: `Last FX fetch failed: ${rateStatus.lastError}` },
    ...mismatches.map((check) => {
      const account = balances.find((b) => b.account.id === check.accountId)?.account;
      return {
        tone: 'amber',
        text: `${account?.name ?? 'Account'}: snapshot of ${fmt.date(check.date)} is off by ${fmt.amount(check.differenceMinor ?? 0, { currency: account?.currency ?? 'CHF' })}`,
        href: `/accounts/${check.accountId}`,
      };
    }),
    noRate.length > 0 && {
      tone: 'amber',
      text: `No FX rate for ${noRate.map((b) => b.account.name).join(', ')}`,
    },
  ].filter(Boolean) as { tone: string; text: string; href?: string }[];

  const chips = [
    { label: 'Today', date: undefined },
    { label: 'End of last month', date: monthEnd(today, 0) },
    { label: 'End of last quarter', date: quarterEnd(today) },
    { label: 'End of last year', date: yearEnd(today) },
  ];
  const columns = [...compare, { label: 'Shown', date: data.shownDate, byAccount: null }];

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <div className="flex gap-2">
          <Link
            href={href({ date: data.requestedDate, archived: showArchived ? undefined : '1' })}
            className={GHOST_BUTTON_CLASS}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
          <Link
            href={href({ date: data.requestedDate, new: showNew ? undefined : '1' })}
            className={GHOST_BUTTON_CLASS}
          >
            {showNew ? 'Close' : '+ New Account'}
          </Link>
        </div>
      </header>

      <section
        aria-label="Needs attention"
        className="rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        {attention.length === 0 ? (
          <p className="px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            ✓ All balances check out and FX rates are fresh.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {attention.map((item, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2">
                <span
                  className={`h-2 w-2 rounded-full ${item.tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`}
                />
                {item.href ? (
                  <Link href={item.href} className="hover:underline">
                    {item.text}
                  </Link>
                ) : (
                  <span>{item.text}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {showNew && (
        <section className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
          {data.banks.length === 0 ? (
            <p className="text-sm">
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
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => {
          const isActive = (chip.date ?? '') === data.requestedDate;
          return (
            <Link
              key={chip.label}
              href={href({ date: chip.date, archived: showArchived ? '1' : undefined })}
              className={`rounded-full border px-3 py-1 text-sm ${
                isActive
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                  : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
              }`}
            >
              {chip.label}
            </Link>
          );
        })}
        <DateForm data={data} compact />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No Accounts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Accounts" className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                {columns.map((col) => (
                  <th key={col.label} className={CELL}>
                    <div>{col.label}</div>
                    <div className="font-normal">{fmt.date(col.date)}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-left">Since year end</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((balance, i) => {
                const { account } = balance;
                const change = changes[i] ?? null;
                return (
                  <tr key={account.id} className={account.archivedAt ? 'text-zinc-400' : undefined}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          title={ACCOUNT_KIND_LABELS[account.kind]}
                          className={`h-2 w-2 rounded-full ${KIND_COLOR[account.kind]}`}
                        />
                        <Link
                          href={`/accounts/${account.id}`}
                          className="font-medium hover:underline"
                        >
                          {account.name}
                        </Link>
                        <span className="text-xs text-zinc-500">
                          {account.bankName} · {account.currency}
                        </span>
                      </div>
                    </td>
                    {columns.map((col) => {
                      const b = col.byAccount ? col.byAccount.get(account.id) : balance;
                      const chf = chfOf(b);
                      return (
                        <td
                          key={col.label}
                          className={`${CELL} ${col.byAccount ? 'text-zinc-500' : 'font-medium'}`}
                        >
                          {chf === null ? '—' : fmt.amount(chf, { currency: 'CHF' })}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 w-24 rounded bg-zinc-100 dark:bg-zinc-800">
                          {change !== null && change !== 0 && (
                            <div
                              className={`absolute top-0 h-2 rounded ${change > 0 ? 'left-1/2 bg-emerald-500' : 'right-1/2 bg-rose-500'}`}
                              style={{ width: `${(Math.abs(change) / maxChange) * 50}%` }}
                            />
                          )}
                        </div>
                        <span className="text-xs">
                          <Delta minor={change} fmt={fmt} />
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-zinc-300 font-semibold dark:border-zinc-700">
              <tr>
                <td className="px-3 py-2">Total (active)</td>
                {columns.map((col) => (
                  <td key={col.label} className={CELL}>
                    {fmt.amount(totalChf(col.byAccount ? [...col.byAccount.values()] : balances), {
                      currency: 'CHF',
                    })}
                  </td>
                ))}
                <td className="px-3 py-2 text-xs">
                  <Delta
                    minor={totalChf(balances) - totalChf([...yearStart.byAccount.values()])}
                    fmt={fmt}
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        CHF at each date&apos;s rate.{' '}
        {rateStatus.lastFetchedAt &&
          `FX rates last fetched ${fmt.dateTime(rateStatus.lastFetchedAt)}.`}
      </p>
    </section>
  );
}
