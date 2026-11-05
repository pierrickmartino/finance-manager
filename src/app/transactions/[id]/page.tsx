import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
import { CARD_CLASS, DANGER_BUTTON_CLASS } from '@/components/surface';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { NotFoundError } from '@/server/services/errors';
import { listCategoryGroups } from '@/server/services/categories';
import { listHistory } from '@/server/services/history';
import { listPayees } from '@/server/services/payees';
import { listTags } from '@/server/services/tags';
import {
  CLASSIFICATION_FIELD_LABELS,
  getClassification,
  getTransaction,
  type Classification,
  type TransactionDetail,
} from '@/server/services/transactions';
import type { ServiceContext } from '@/server/services/context';
import {
  getTransferCounterpart,
  listLinkOptions,
  splitLineSide,
  transactionSide,
} from '@/server/services/transfers';
import { historyHref } from '../../history/history-table';
import { HistoryTimeline } from '../../history/history-timeline';
import {
  deleteTransactionFromDetailAction,
  editClassificationAction,
  unlockFieldAction,
} from './actions';
import { ClassificationForm } from './classification-form';
import { SplitSection, type LineTransfers } from './split-section';
import { transactionBadges } from './transaction-badges';
import { TransactionReceipt } from './transaction-receipt';
import { TransferSection } from './transfer-section';

export const metadata: Metadata = { title: 'Transaction · Finance Manager' };

const PANEL = `${CARD_CLASS} flex flex-col gap-3 p-5`;

interface TransactionPageProps {
  params: Promise<{ id: string }>;
}

/** Each Split line's other side when it is a Transfer side, else what it may be linked with. */
async function loadLineTransfers(
  ctx: ServiceContext,
  transaction: TransactionDetail,
): Promise<LineTransfers> {
  const entries = await Promise.all(
    transaction.splitLines.map(async (line) => {
      const side = splitLineSide(line.id);
      const counterpart = line.transferId ? await getTransferCounterpart(ctx, side) : null;
      const options = line.transferId ? [] : await listLinkOptions(ctx, side);
      return [line.id, { counterpart, options }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function loadTransaction(id: string): Promise<TransactionDetail> {
  try {
    return await getTransaction(await getServiceContext(), id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/**
 * One Transaction (spec 38, 48, 63-65, 116), as a receipt and a workbench. On the left, what
 * happened: the bank fields read-only and the History. On the right, kept in view from `lg`
 * up, what to do with it: classify (with the fields locked against Rules), split, link as a
 * Transfer.
 */
export default async function TransactionPage({ params }: TransactionPageProps) {
  const { id } = await params;
  const transaction = await loadTransaction(id);
  const ctx = await getServiceContext();
  const isSplit = transaction.splitLines.length > 0;
  const [history, fmt, classification, groups, payees, tags, counterpart, lineTransfers] =
    await Promise.all([
      listHistory(ctx, { entityType: 'transaction', entityId: transaction.id }),
      getFormatter(),
      getClassification(ctx, transaction.id),
      listCategoryGroups(ctx),
      listPayees(ctx),
      listTags(ctx),
      getTransferCounterpart(ctx, transactionSide(transaction.id)),
      loadLineTransfers(ctx, transaction),
    ]);

  return (
    <section className="flex flex-col gap-4">
      <Link href="/transactions" className="text-sm text-zinc-500 hover:underline">
        ← Transactions
      </Link>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <TransactionReceipt
            transaction={transaction}
            badges={transactionBadges(transaction, classification)}
            fmt={fmt}
          />
          <section aria-labelledby="history" className="flex flex-col gap-3">
            <h2 id="history" className="text-sm font-semibold text-zinc-500">
              History
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">No History for this Transaction.</p>
            ) : (
              <HistoryTimeline entries={history} fmt={fmt} label="Transaction History" />
            )}
            <Link
              href={historyHref({ entityType: 'transaction', entityId: transaction.id })}
              className="text-sm underline"
            >
              Open in History
            </Link>
          </section>
        </div>

        <aside
          aria-label="Work on this Transaction"
          className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4"
        >
          <section aria-labelledby="classification" className={PANEL}>
            <h2 id="classification" className="text-lg font-semibold">
              Classification
            </h2>
            <ClassificationForm
              classification={classification}
              groups={groups}
              payeeNames={payees.map((payee) => payee.name)}
              tagNames={tags.map((tag) => tag.name)}
              action={editClassificationAction.bind(null, transaction.id)}
            />
            <LockedFields classification={classification} />
            <Link
              href={`/rules/new?fromTransaction=${transaction.id}`}
              className="text-sm underline"
            >
              Create rule from this Transaction
            </Link>
          </section>
          <SplitSection
            transaction={transaction}
            groups={groups}
            payees={payees}
            lineTransfers={lineTransfers}
            fmt={fmt}
            className={PANEL}
          />
          {/* A split Transaction is linked by its Split lines, not as a whole (ADR-0005). */}
          {!isSplit && (
            <TransferSection
              transactionId={transaction.id}
              counterpart={counterpart}
              options={
                counterpart ? [] : await listLinkOptions(ctx, transactionSide(transaction.id))
              }
              fmt={fmt}
              className={PANEL}
            />
          )}
          <TransactionActions transaction={transaction} />
        </aside>
      </div>
    </section>
  );
}

/** Edit the details of a Manual transaction; delete any Transaction. */
function TransactionActions({ transaction }: { transaction: TransactionDetail }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      {transaction.isManual ? (
        <Link
          href={`/accounts/${transaction.accountId}/manual/${transaction.id}`}
          className={BUTTON_CLASS}
        >
          Edit details
        </Link>
      ) : (
        <span />
      )}
      <ActionForm
        action={deleteTransactionFromDetailAction.bind(null, transaction.id, transaction.isManual)}
        label="Delete Transaction"
        confirmMessage={
          transaction.isManual
            ? 'Delete this Manual transaction?'
            : 'Delete this Transaction? Importing its file again adds it back.'
        }
      >
        <button type="submit" className={DANGER_BUTTON_CLASS}>
          Delete Transaction
        </button>
      </ActionForm>
    </div>
  );
}

/** The fields a manual edit locked against Rules, each with an Unlock button (spec 65). */
function LockedFields({ classification }: { classification: Classification }) {
  if (classification.lockedFields.length === 0) {
    return <p className="text-sm text-zinc-500">No field is locked: Rules may classify it.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Locked against Rules, because you edited them:
      </p>
      <ul aria-label="Locked fields" className="flex flex-wrap gap-2">
        {classification.lockedFields.map((field) => (
          <li key={field} className="flex items-center gap-2 text-sm">
            <span>{CLASSIFICATION_FIELD_LABELS[field]}</span>
            <ActionForm
              action={unlockFieldAction.bind(null, classification.transactionId, field)}
              label={`Unlock ${CLASSIFICATION_FIELD_LABELS[field]}`}
            >
              <button
                type="submit"
                aria-label={`Unlock ${CLASSIFICATION_FIELD_LABELS[field]}`}
                className={BUTTON_CLASS}
              >
                Unlock
              </button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </div>
  );
}
