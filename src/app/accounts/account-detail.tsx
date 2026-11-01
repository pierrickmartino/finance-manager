import Link from 'next/link';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import { ACCOUNT_KIND_LABELS, IMPORT_FORMAT_LABELS } from '@/server/services/accounts';
import type { AccountBalance } from '@/server/services/accounts/balances';

const HEADING_ID = 'account-detail-heading';

/** The selected Account's balance on an earlier date, when it had one. */
export interface EarlierBalance {
  label: string;
  date: string;
  balance: AccountBalance | undefined;
}

interface AccountDetailProps {
  balance: AccountBalance;
  earlier: EarlierBalance[];
  fmt: Formatter;
}

/**
 * The detail pane: the selected Account's balance on the shown date (in its Currency and in
 * CHF), its facts and its balance on a few earlier dates.
 */
export function AccountDetail({ balance, earlier, fmt }: AccountDetailProps) {
  const { account } = balance;
  const money = (minor: number) => fmt.amount(minor, { currency: account.currency });
  const facts: [string, string][] = [
    ['Bank', account.bankName],
    ['Kind', ACCOUNT_KIND_LABELS[account.kind]],
    ['Currency', account.currency],
    ['IBAN', account.iban ?? '—'],
    [
      'Import format',
      account.importFormat ? IMPORT_FORMAT_LABELS[account.importFormat] : 'None (manual)',
    ],
    ['Status', account.archivedAt ? `Archived on ${fmt.date(account.archivedAt)}` : 'Active'],
  ];

  return (
    <section aria-labelledby={HEADING_ID} className={`${CARD_CLASS} flex flex-col gap-6 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={HEADING_ID} className="text-xl font-semibold">
            {account.name}
          </h2>
          <p className="text-3xl font-semibold tabular-nums">{money(balance.balanceMinor)}</p>
          <ChfValue balance={balance} fmt={fmt} />
          {balance.snapshotDate && (
            <p className="text-sm text-zinc-500">
              Balance snapshot of {fmt.date(balance.snapshotDate)}
            </p>
          )}
        </div>
        <Link href={`/accounts/${account.id}`} className={PRIMARY_BUTTON_CLASS}>
          Open Account →
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-zinc-500">{label}</dt>
            <dd className={`truncate ${label === 'IBAN' ? 'font-mono' : 'font-medium'}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <table aria-label="Earlier balances" className="w-full text-sm">
        <thead className="text-xs text-zinc-500">
          <tr>
            <th className="pb-1 text-left font-medium">On</th>
            <th className="pb-1 text-right font-medium">Balance</th>
            <th className="pb-1 text-right font-medium">Change since</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {earlier.map(({ label, date, balance: then }) => (
            <tr key={label}>
              <td className="py-1.5">
                {label} <span className="text-zinc-500">({fmt.date(date)})</span>
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {then ? money(then.balanceMinor) : '—'}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {then ? (
                  <Change minor={balance.balanceMinor - then.balanceMinor} money={money} />
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ChfValue({ balance, fmt }: { balance: AccountBalance; fmt: Formatter }) {
  if (!balance.chf) return <p className="text-sm text-zinc-500">No FX rate</p>;
  if (balance.account.currency === 'CHF') return null;
  const { amountMinor, rate } = balance.chf;
  return (
    <p className="text-sm text-zinc-500 tabular-nums">
      {fmt.amount(amountMinor, { currency: 'CHF' })} at {rate.rateToChf} ({fmt.date(rate.rateDate)})
    </p>
  );
}

function Change({ minor, money }: { minor: number; money: (minor: number) => string }) {
  if (minor === 0) return <span className="text-zinc-400">±0</span>;
  const tone =
    minor > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <span className={tone}>
      {minor > 0 ? '+' : '−'}
      {money(Math.abs(minor))}
    </span>
  );
}
