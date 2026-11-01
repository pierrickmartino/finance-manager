import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
import { categoryLabel } from '@/lib/classification';
import type { Formatter } from '@/lib/format';
import type { CategoryGroup } from '@/server/services/categories';
import type { TransactionDetail } from '@/server/services/transactions';
import { splitLabel } from '../transaction-display';
import { removeSplitAction, splitTransactionAction } from './actions';
import { SplitForm } from './split-form';
import { initialSplitDrafts } from './split-lines';

const CELL = 'px-3 py-2 text-left';
const SUMMARY = `${BUTTON_CLASS} inline-block cursor-pointer list-none`;

interface SplitSectionProps {
  transaction: TransactionDetail;
  groups: CategoryGroup[];
  fmt: Formatter;
}

/**
 * The Transaction's Split (ADR-0004): its Split lines, with editing and removing, or the
 * action that splits it. A Transfer can't be split.
 */
export function SplitSection({ transaction, groups, fmt }: SplitSectionProps) {
  const isSplit = transaction.splitLines.length > 0;
  if (!isSplit && transaction.transferId) return null;
  const form = (
    <SplitForm
      amountMinor={transaction.amountMinor}
      currency={transaction.currency}
      initialLines={initialSplitDrafts(transaction, fmt.settings.numberFormat)}
      groups={groups}
      action={splitTransactionAction.bind(null, transaction.id)}
    />
  );

  return (
    <section aria-labelledby="split" className="flex flex-col gap-3">
      <h2 id="split" className="text-lg font-semibold">
        {splitLabel(transaction) ?? 'Split'}
      </h2>
      {isSplit ? (
        <>
          <SplitLinesTable transaction={transaction} fmt={fmt} />
          <div className="flex flex-wrap items-start gap-3">
            <details className="flex flex-col gap-3">
              <summary className={SUMMARY}>Edit Split</summary>
              <div className="pt-3">{form}</div>
            </details>
            <ActionForm
              action={removeSplitAction.bind(null, transaction.id)}
              label="Remove Split"
              confirmMessage="Remove this Split? The Transaction becomes Unclassified."
            >
              <button type="submit" className={BUTTON_CLASS}>
                Remove Split
              </button>
            </ActionForm>
          </div>
        </>
      ) : (
        <details className="flex flex-col gap-3">
          <summary className={SUMMARY}>Split Transaction</summary>
          <p className="pt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Divide the amount into lines that add up to it, each with its own Category.
          </p>
          <div className="pt-3">{form}</div>
        </details>
      )}
    </section>
  );
}

function SplitLinesTable({ transaction, fmt }: Omit<SplitSectionProps, 'groups'>) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Split lines" className="w-full text-sm">
        <thead className="border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className={CELL}>Category</th>
            <th className={CELL}>Tags</th>
            <th className={CELL}>Note</th>
            <th className={`${CELL} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {transaction.splitLines.map((line) => (
            <tr key={line.id}>
              <td className={CELL}>{categoryLabel(line.category)}</td>
              <td className={CELL}>{line.tags.map((tag) => tag.name).join(', ') || '—'}</td>
              <td className={CELL}>{line.note ?? '—'}</td>
              <td className={`${CELL} text-right tabular-nums`}>
                {fmt.amount(line.amountMinor, { currency: transaction.currency })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
