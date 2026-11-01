import Link from 'next/link';
import { CARD_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { AccountBalance } from '@/server/services/accounts/balances';
import { accountsHref, groupByBank, NEW_ACCOUNT, totalChfMinor } from './view';

interface AccountListProps {
  balances: AccountBalance[];
  /** The selected Account's id, or `NEW_ACCOUNT`. */
  selected: string;
  /** The requested `?date=`, kept by every link. */
  date: string;
  mismatchedAccounts: ReadonlySet<string>;
  fmt: Formatter;
}

/**
 * The master list: Accounts grouped by Bank, each Bank with its CHF total, each Account with
 * its balance in its own Currency. The last entry opens the New Account form.
 */
export function AccountList({
  balances,
  selected,
  date,
  mismatchedAccounts,
  fmt,
}: AccountListProps) {
  return (
    <nav aria-label="Account list" className={`${CARD_CLASS} flex flex-col p-2`}>
      {groupByBank(balances).map(({ bankName, rows }) => (
        <section key={bankName} aria-label={bankName} className="flex flex-col">
          <h2 className="flex justify-between gap-3 px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            <span className="truncate">{bankName}</span>
            <span className="tabular-nums">
              {fmt.amount(totalChfMinor(rows).amountMinor, { currency: 'CHF' })}
            </span>
          </h2>
          <ul className="flex flex-col">
            {rows.map(({ account, balanceMinor }) => {
              const isSelected = account.id === selected;
              return (
                <li key={account.id}>
                  <Link
                    href={accountsHref({ account: account.id, date })}
                    scroll={false}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm ${
                      isSelected
                        ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    } ${account.archivedAt ? 'text-zinc-400 dark:text-zinc-500' : ''}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {mismatchedAccounts.has(account.id) && (
                        <span
                          title="Snapshot mismatch"
                          className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        >
                          <span className="sr-only">Snapshot mismatch</span>
                        </span>
                      )}
                      <span className="truncate">{account.name}</span>
                      {account.archivedAt && <span className="text-xs">(archived)</span>}
                    </span>
                    <span className="tabular-nums">
                      {fmt.amount(balanceMinor, { currency: account.currency })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Link
        href={accountsHref({ account: NEW_ACCOUNT, date })}
        scroll={false}
        aria-current={selected === NEW_ACCOUNT ? 'true' : undefined}
        className={`mt-3 rounded-md border border-dashed border-zinc-300 px-2 py-2 text-center text-sm dark:border-zinc-700 ${
          selected === NEW_ACCOUNT
            ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
        }`}
      >
        + New Account
      </Link>
    </nav>
  );
}
