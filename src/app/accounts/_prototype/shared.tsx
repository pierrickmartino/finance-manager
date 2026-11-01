// PROTOTYPE — data and tiny helpers shared by the Accounts page variants. Throwaway.
import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { AccountKind } from '@/server/services/accounts';
import type { AccountBalance } from '@/server/services/accounts/balances';
import type { SnapshotCheck } from '@/server/services/balance-snapshots';
import type { Bank } from '@/server/services/banks';
import type { RateStatus } from '@/server/services/fx';

/** Balances of every Account on one comparison date. */
export interface BalancesOn {
  label: string;
  date: string;
  byAccount: Map<string, AccountBalance>;
}

export interface AccountsData {
  /** Balances on the shown date. */
  balances: AccountBalance[];
  /** Earlier dates, oldest first: end of last year, 90 days and 30 days before the shown date. */
  compare: BalancesOn[];
  rateStatus: RateStatus;
  mismatches: SnapshotCheck[];
  banks: Bank[];
  fmt: Formatter;
  shownDate: string;
  requestedDate: string;
  error: string | null;
  params: Record<string, string | undefined>;
}

export const KIND_ORDER: AccountKind[] = ['current', 'savings', '3a', 'loan'];

export const KIND_COLOR: Record<AccountKind, string> = {
  current: 'bg-sky-500',
  savings: 'bg-emerald-500',
  '3a': 'bg-violet-500',
  loan: 'bg-rose-500',
};

const MS_PER_DAY = 86_400_000;

export function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The last day of the month `monthsBack` months before `date`'s month (0 = previous month). */
export function monthEnd(date: string, monthsBack: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 0))
    .toISOString()
    .slice(0, 10);
}

export function quarterEnd(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const quarterStart = Math.floor(d.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), quarterStart, 0)).toISOString().slice(0, 10);
}

export function yearEnd(date: string): string {
  return `${Number(date.slice(0, 4)) - 1}-12-31`;
}

export function chfOf(balance: AccountBalance | undefined): number | null {
  return balance?.chf?.amountMinor ?? null;
}

/** Sum of the CHF values of active Accounts; Accounts without a rate are left out. */
export function totalChf(balances: AccountBalance[]): number {
  return balances
    .filter((balance) => !balance.account.archivedAt)
    .reduce((sum, balance) => sum + (balance.chf?.amountMinor ?? 0), 0);
}

export function Delta({ minor, fmt }: { minor: number | null; fmt: Formatter }) {
  if (minor === null) return <span className="text-zinc-400">—</span>;
  if (minor === 0) return <span className="text-zinc-400 tabular-nums">±0</span>;
  const tone =
    minor > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <span className={`tabular-nums ${tone}`}>
      {minor > 0 ? '+' : '−'}
      {fmt.amount(Math.abs(minor), { currency: 'CHF' })}
    </span>
  );
}

/** The `?date=` form, compact. */
export function DateForm({ data, compact = false }: { data: AccountsData; compact?: boolean }) {
  const variant = data.params.variant;
  return (
    <form aria-label="Balance date" className="flex flex-wrap items-center gap-2 text-sm">
      {variant && <input type="hidden" name="variant" value={variant} />}
      {!compact && <span className="text-zinc-500">Balances on</span>}
      <input
        type="date"
        name="date"
        defaultValue={data.shownDate}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
      >
        Show
      </button>
      {data.requestedDate && (
        <Link href={`/accounts${variant ? `?variant=${variant}` : ''}`} className="underline">
          Today
        </Link>
      )}
      {data.error && <span className="text-red-700 dark:text-red-400">{data.error}</span>}
    </form>
  );
}
