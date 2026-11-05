import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
import { categoryLabel } from '@/lib/classification';
import type { Formatter } from '@/lib/format';
import type { CategoryGroup } from '@/server/services/categories';
import type { Payee } from '@/server/services/payees';
import type { TransactionDetail } from '@/server/services/transactions';
import { splitLineSide, type TransferSideView } from '@/server/services/transfers';
import { splitLabel } from '../transaction-display';
import { removeSplitAction, splitTransactionAction } from './actions';
import { SplitForm } from './split-form';
import { initialSplitDrafts } from './split-lines';
import { LinkTransferForm, TransferCounterpart, UnlinkTransferForm } from './transfer-section';

const CELL = 'px-3 py-2 text-left';
const SUMMARY = `${BUTTON_CLASS} inline-block cursor-pointer list-none`;

/**
 * By Split line id: the line's other side when it is a Transfer side (ADR-0005), else the sides
 * it may be linked with.
 */
export type LineTransfers = Record<
  string,
  { counterpart: TransferSideView | null; options: TransferSideView[] }
>;

interface SplitSectionProps {
  transaction: TransactionDetail;
  groups: CategoryGroup[];
  /** The Payees a Split line may name (ADR-0006). */
  payees: Pick<Payee, 'id' | 'name'>[];
  lineTransfers: LineTransfers;
  fmt: Formatter;
  /** Classes of the section, e.g. to draw it as a card. */
  className?: string;
}

/**
 * The Transaction's Split (ADR-0004): its Split lines, with editing and removing, or the
 * action that splits it. A Transfer can't be split.
 */
export function SplitSection({
  transaction,
  groups,
  payees,
  lineTransfers,
  fmt,
  className = 'flex flex-col gap-3',
}: SplitSectionProps) {
  const isSplit = transaction.splitLines.length > 0;
  if (!isSplit && transaction.transferId) return null;
  const transfers = Object.fromEntries(
    Object.entries(lineTransfers).flatMap(([lineId, { counterpart }]) =>
      counterpart
        ? [[lineId, <TransferCounterpart key={lineId} counterpart={counterpart} fmt={fmt} />]]
        : [],
    ),
  );
  const form = (
    <SplitForm
      amountMinor={transaction.amountMinor}
      currency={transaction.currency}
      initialLines={initialSplitDrafts(transaction, fmt.settings.numberFormat, payees)}
      groups={groups}
      payees={payees.map(({ id, name }) => ({ id, name }))}
      transactionPayee={transaction.payee?.name ?? null}
      transfers={transfers}
      action={splitTransactionAction.bind(null, transaction.id)}
    />
  );

  return (
    <section aria-labelledby="split" className={className}>
      <h2 id="split" className="text-lg font-semibold">
        {splitLabel(transaction) ?? 'Split'}
      </h2>
      {isSplit ? (
        <>
          <SplitLinesTable transaction={transaction} lineTransfers={lineTransfers} fmt={fmt} />
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

type TableProps = Pick<SplitSectionProps, 'transaction' | 'lineTransfers' | 'fmt'>;

function SplitLinesTable({ transaction, lineTransfers, fmt }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Split lines" className="w-full text-sm">
        <thead className="border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className={CELL}>Category</th>
            <th className={CELL}>Payee</th>
            <th className={CELL}>Tags</th>
            <th className={CELL}>Note</th>
            <th className={`${CELL} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {transaction.splitLines.map((line, index) => (
            <tr key={line.id}>
              <td className={CELL}>
                <LineClassification
                  transactionId={transaction.id}
                  line={line}
                  position={index + 1}
                  transfer={lineTransfers[line.id]}
                  fmt={fmt}
                />
              </td>
              <td className={CELL}>
                <LinePayee line={line} />
              </td>
              <td className={CELL}>{line.tags.map((tag) => tag.name).join(', ') || '—'}</td>
              <td className={CELL}>{line.note ?? '—'}</td>
              <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                {fmt.amount(line.amountMinor, { currency: transaction.currency })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The Payee a Split line reports under (ADR-0006): its own, or else its Transaction's, shown
 * muted as inherited. A Transfer line has none.
 */
function LinePayee({ line }: { line: TransactionDetail['splitLines'][number] }) {
  if (line.transferId !== null) return <>—</>;
  if (line.payee) return <>{line.payee.name}</>;
  if (!line.reportedPayee) return <>—</>;
  return (
    <span className="text-zinc-500" title="The Transaction's Payee">
      {line.reportedPayee.name}
    </span>
  );
}

interface LineClassificationProps {
  transactionId: string;
  line: TransactionDetail['splitLines'][number];
  /** 1-based, as the Split form numbers lines. */
  position: number;
  transfer: LineTransfers[string] | undefined;
  fmt: Formatter;
}

/**
 * A Split line's Category, or its Transfer with the other side (ADR-0005); an unlinked line
 * offers Link as Transfer when there is a side to link it with.
 */
function LineClassification({
  transactionId,
  line,
  position,
  transfer,
  fmt,
}: LineClassificationProps) {
  if (transfer?.counterpart) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sky-700 dark:text-sky-400">
          <TransferCounterpart counterpart={transfer.counterpart} fmt={fmt} />
        </span>
        <UnlinkTransferForm
          transactionId={transactionId}
          side={splitLineSide(line.id)}
          label={`Unlink line ${position} Transfer`}
        />
      </div>
    );
  }
  const options = transfer?.options ?? [];
  return (
    <div className="flex flex-col gap-1">
      <span>{line.category ? categoryLabel(line.category) : 'Unclassified'}</span>
      {options.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-zinc-500 underline">
            Link as Transfer
          </summary>
          <div className="pt-2">
            <LinkTransferForm
              transactionId={transactionId}
              side={splitLineSide(line.id)}
              options={options}
              fmt={fmt}
              label={`Link line ${position} as Transfer`}
            />
          </div>
        </details>
      )}
    </div>
  );
}
