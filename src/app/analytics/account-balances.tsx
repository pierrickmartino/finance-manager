import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { AccountBalances } from '@/server/services/analytics';
import { SectionCard, SectionEmpty } from './section';

export const ACCOUNT_BALANCES = 'Account balances in CHF';

const CELL = 'px-3 py-1.5 whitespace-nowrap';

interface AccountBalancesSectionProps {
  balances: Promise<AccountBalances>;
  fmt: Formatter;
  className?: string;
}

/**
 * Analytics' Account balances in CHF, once they arrive: each Account's balance today in the
 * Base currency, each opening its Account, and their total. The Period view doesn't change it.
 */
export async function AccountBalancesSection({
  balances,
  fmt,
  className,
}: AccountBalancesSectionProps) {
  const loaded = await balances;
  return (
    <SectionCard
      name={ACCOUNT_BALANCES}
      className={className}
      unconverted={{ count: loaded.unconvertedCount, of: 'Account' }}
    >
      {loaded.isEmpty ? (
        <SectionEmpty>Nothing to show yet: no Accounts.</SectionEmpty>
      ) : (
        <BalancesTable balances={loaded} fmt={fmt} />
      )}
    </SectionCard>
  );
}

function BalancesTable({ balances, fmt }: { balances: AccountBalances; fmt: Formatter }) {
  const chf = (minor: number) => fmt.amount(minor, { currency: 'CHF' });
  return (
    <div className="overflow-x-auto">
      <table aria-label={ACCOUNT_BALANCES} className="w-full text-sm">
        <thead className="border-b border-rule text-muted">
          <tr>
            <th scope="col" className={`${CELL} text-left font-medium`}>
              Account
            </th>
            <th scope="col" className={`${CELL} text-right font-medium`}>
              Balance on {fmt.date(balances.date)}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {balances.rows.map((row) => (
            <tr key={row.accountId}>
              <th scope="row" className={`${CELL} text-left font-normal`}>
                <Link href={`/accounts/${row.accountId}`} className="hover:underline">
                  {row.label}
                </Link>
              </th>
              <td className={`${CELL} text-right tabular-nums`}>
                {row.chfMinor === null ? (
                  <span className="text-muted">No FX rate yet</span>
                ) : (
                  <span className={row.chfMinor < 0 ? 'text-negative' : ''}>
                    {chf(row.chfMinor)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {balances.totalChfMinor !== null && (
          <tfoot className="border-t border-rule-strong font-semibold">
            <tr>
              <th scope="row" className={`${CELL} text-left`}>
                Total
              </th>
              <td className={`${CELL} text-right tabular-nums`}>{chf(balances.totalChfMinor)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
