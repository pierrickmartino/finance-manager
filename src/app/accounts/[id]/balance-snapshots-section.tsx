import type { Formatter } from '@/lib/format';
import type { Account } from '@/server/services/accounts';
import type { SnapshotCheck } from '@/server/services/balance-snapshots';
import { deleteBalanceSnapshotAction, recordBalanceSnapshotAction } from './actions';
import { BalanceSnapshotForm } from './balance-snapshot-form';
import { DeleteButton } from './delete-button';

const CELL = 'px-3 py-2 text-left';

interface BalanceSnapshotsSectionProps {
  account: Account;
  snapshots: SnapshotCheck[];
  fmt: Formatter;
}

function checkLabel(check: SnapshotCheck, fmt: Formatter, currency: string): string {
  if (check.computedMinor === null) return 'Snapshot only';
  if (!check.isMismatch) return 'Matches';
  return `Differs by ${fmt.amount(check.differenceMinor ?? 0, { currency })}`;
}

/** An Account's Balance snapshots (spec 42–44), each checked against the computed balance. */
export function BalanceSnapshotsSection({ account, snapshots, fmt }: BalanceSnapshotsSectionProps) {
  const { currency } = account;
  return (
    <section aria-labelledby="balance-snapshots" className="flex flex-col gap-3">
      <h2 id="balance-snapshots" className="text-lg font-semibold">
        Balance snapshots
      </h2>
      {snapshots.length === 0 ? (
        <p className="text-sm text-zinc-500">No Balance snapshots yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Balance snapshots" className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={CELL}>Date</th>
                <th className={`${CELL} text-right`}>Snapshot</th>
                <th className={`${CELL} text-right`}>Computed</th>
                <th className={CELL}>Check</th>
                <th className={CELL}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {snapshots.map((check) => (
                <tr key={check.id}>
                  <td className={CELL}>{fmt.date(check.date)}</td>
                  <td className={`${CELL} text-right tabular-nums`}>
                    {fmt.amount(check.balanceMinor, { currency })}
                  </td>
                  <td className={`${CELL} text-right tabular-nums`}>
                    {check.computedMinor === null
                      ? '—'
                      : fmt.amount(check.computedMinor, { currency })}
                  </td>
                  <td
                    className={`${CELL} ${check.isMismatch ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}
                  >
                    {checkLabel(check, fmt, currency)}
                  </td>
                  <td className={CELL}>
                    <DeleteButton
                      action={deleteBalanceSnapshotAction.bind(null, account.id, check.id)}
                      label={`Delete Balance snapshot of ${fmt.date(check.date)}`}
                      confirmation="Delete this Balance snapshot?"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <BalanceSnapshotForm
        action={recordBalanceSnapshotAction.bind(null, account.id)}
        currency={currency}
      />
    </section>
  );
}
