import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { AccountBalance } from '@/server/services/accounts/balances';
import { ACCOUNT_KIND_LABELS } from '@/server/services/accounts/input';
import { accountsHref, NEW_ACCOUNT } from '../accounts/view';
import type { BankSummary } from './view';

interface BankDetailProps {
  summary: BankSummary<AccountBalance>;
  fmt: Formatter;
}

/** The detail pane: the Bank's CHF total, its per-Currency totals and its Accounts. */
export function BankDetail({ summary, fmt }: BankDetailProps) {
  const { bank, accounts, chfMinor, missingRates, byCurrency } = summary;
  return (
    <article aria-label={bank.name} className={`${CARD_CLASS} flex flex-col gap-5 p-5`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-xl font-semibold">{bank.name}</h2>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">
            {fmt.amount(chfMinor, { currency: 'CHF' })}
          </p>
          {missingRates > 0 && (
            <p className="text-xs text-amber-600">
              {missingRates} Account{missingRates === 1 ? '' : 's'} without an FX rate left out
            </p>
          )}
        </div>
      </header>

      {byCurrency.length > 0 && (
        <dl aria-label="Totals by Currency" className="flex flex-wrap gap-3">
          {byCurrency.map(({ currency, amountMinor }) => (
            <div
              key={currency}
              className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <dt className="text-xs text-zinc-500">In {currency}</dt>
              <dd className="font-medium tabular-nums">{fmt.amount(amountMinor, { currency })}</dd>
            </div>
          ))}
        </dl>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">No Accounts at this Bank yet.</p>
      ) : (
        <AccountTable accounts={accounts} fmt={fmt} />
      )}

      <footer className="border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
        <Link href={accountsHref({ account: NEW_ACCOUNT })} className="underline">
          Add an Account
        </Link>
      </footer>
    </article>
  );
}

function AccountTable({ accounts, fmt }: { accounts: AccountBalance[]; fmt: Formatter }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs tracking-wide text-zinc-500 uppercase">
          <tr>
            <th className="py-1 pr-4 font-semibold">Account</th>
            <th className="py-1 pr-4 font-semibold">Kind</th>
            <th className="py-1 pr-4 font-semibold">IBAN</th>
            <th className="py-1 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {accounts.map(({ account, balanceMinor }) => (
            <tr
              key={account.id}
              className={account.archivedAt ? 'text-zinc-400 dark:text-zinc-500' : ''}
            >
              <td className="py-2 pr-4">
                <Link href={accountsHref({ account: account.id })} className="underline">
                  {account.name}
                </Link>
                {account.archivedAt && <span className="ml-1 text-xs">(archived)</span>}
              </td>
              <td className="py-2 pr-4">{ACCOUNT_KIND_LABELS[account.kind]}</td>
              <td className="py-2 pr-4 font-mono text-xs">{account.iban ?? '—'}</td>
              <td className="py-2 text-right tabular-nums">
                {fmt.amount(balanceMinor, { currency: account.currency })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
