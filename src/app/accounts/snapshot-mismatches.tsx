import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { Account } from '@/server/services/accounts';
import type { SnapshotCheck } from '@/server/services/balance-snapshots';

/** One mismatch in words: what the bank says, what the app computes, and the difference. */
export function describeMismatch(check: SnapshotCheck, currency: string, fmt: Formatter): string {
  const amount = (minor: number) => fmt.amount(minor, { currency });
  return (
    `On ${fmt.date(check.date)} the Balance snapshot says ${amount(check.balanceMinor)}, ` +
    `but the computed balance is ${amount(check.computedMinor ?? 0)} ` +
    `(difference ${amount(check.differenceMinor ?? 0)}).`
  );
}

interface SnapshotMismatchesProps {
  mismatches: SnapshotCheck[];
  /** The Accounts the mismatches belong to. */
  accounts: Account[];
  fmt: Formatter;
  /** In the overview, each line names and links its Account. */
  showAccountNames?: boolean;
}

/**
 * The warning shown when computed balances disagree with Balance snapshots (spec 43): a sign of
 * missing or wrong Manual transactions. Renders nothing when everything agrees.
 */
export function SnapshotMismatches({
  mismatches,
  accounts,
  fmt,
  showAccountNames = false,
}: SnapshotMismatchesProps) {
  if (mismatches.length === 0) return null;
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <p className="font-medium">
        {mismatches.length === 1
          ? 'A Balance snapshot differs from the computed balance.'
          : `${mismatches.length} Balance snapshots differ from the computed balance.`}
      </p>
      <ul className="list-disc pl-5">
        {mismatches.map((check) => {
          const account = byId.get(check.accountId);
          if (!account) return null;
          return (
            <li key={check.id}>
              {showAccountNames && (
                <>
                  <Link href={`/accounts/${account.id}`} className="font-medium underline">
                    {account.name}
                  </Link>
                  :{' '}
                </>
              )}
              {describeMismatch(check, account.currency, fmt)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
