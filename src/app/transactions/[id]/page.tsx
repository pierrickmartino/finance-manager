import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
import { CARD_CLASS, DANGER_BUTTON_CLASS, SECTION_TITLE_CLASS } from '@/components/surface';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { NotFoundError, ValidationError } from '@/server/services/errors';
import { listCategoryGroups } from '@/server/services/categories';
import { listHistory } from '@/server/services/history';
import { listPayees } from '@/server/services/payees';
import { listTags } from '@/server/services/tags';
import {
  CLASSIFICATION_FIELD_LABELS,
  getClassification,
  getTransaction,
  locateTransaction,
  type Classification,
  type TransactionDetail,
  type TransactionPlace,
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
import { BackToTransactions } from '../back-to-list';
import {
  readDetailList,
  transactionsBackHref,
  type SearchValues,
  type TransactionSearch,
} from '../search';
import { BankDetails } from './bank-details';
import { DETAIL_COLUMNS_CLASS, DETAIL_PANEL_CLASS, DETAIL_TOP_LINE_CLASS } from './detail-layout';
import { ListStepper } from './list-stepper';
import { ClassificationForm } from './classification-form';
import { SplitSection, type LineTransfers } from './split-section';
import { transactionBadges } from './transaction-badges';
import { TransactionHeader } from './transaction-header';
import { TransferSection } from './transfer-section';

export const metadata: Metadata = { title: 'Transaction · Finance Manager' };

/**
 * The narrow left column stays in view at the top of the screen while the wide
 * one scrolls; if it is taller than the screen, it scrolls on its own so nothing is out of reach.
 * The padding keeps the cards' shadows from being clipped by the overflow.
 */
const EDITS_COLUMN =
  'flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:-m-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:p-1';

interface TransactionPageProps {
  params: Promise<{ id: string }>;
  /** The Transactions list it was opened from, if any (ADR-0013). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

/** Where the Transaction sits in its list; null with no list, or one whose filters don't read. */
async function locateInList(
  ctx: ServiceContext,
  list: TransactionSearch | null,
  id: string,
): Promise<TransactionPlace | null> {
  if (!list?.query) return null;
  try {
    return await locateTransaction(ctx, list.query, id);
  } catch (error: unknown) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
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
 * One Transaction (spec 38, 48, 63-65, 116). A one-line header says what happened; beneath it,
 * its Split across the full width (its table needs the room), then two columns. On the left,
 * narrow and kept in view, what to do with it as a whole: classify (with the fields locked
 * against Rules) and link as a Transfer. On the right, wide, what is known about it: the bank
 * fields and its History.
 */
export default async function TransactionPage({ params, searchParams }: TransactionPageProps) {
  const { id } = await params;
  const transaction = await loadTransaction(id);
  const ctx = await getServiceContext();
  const isSplit = transaction.splitLines.length > 0;
  const fmt = await getFormatter();
  const list = readDetailList(await searchParams, fmt.settings.numberFormat);
  const [history, place, classification, groups, payees, tags, counterpart, lineTransfers] =
    await Promise.all([
      listHistory(ctx, { entityType: 'transaction', entityId: transaction.id }),
      locateInList(ctx, list, transaction.id),
      getClassification(ctx, transaction.id),
      listCategoryGroups(ctx),
      listPayees(ctx),
      listTags(ctx),
      getTransferCounterpart(ctx, transactionSide(transaction.id)),
      loadLineTransfers(ctx, transaction),
    ]);

  return (
    <section className="flex flex-col gap-5">
      <div className={DETAIL_TOP_LINE_CLASS}>
        <BackToTransactions
          href={transactionsBackHref(list?.values ?? null, place, transaction.id)}
        />
        {list && place && <ListStepper place={place} values={list.values} />}
      </div>
      <TransactionHeader
        transaction={transaction}
        badges={transactionBadges(transaction, classification)}
        fmt={fmt}
        actions={<TransactionActions transaction={transaction} list={list?.values ?? null} />}
      />
      <SplitSection
        transaction={transaction}
        groups={groups}
        payees={payees}
        lineTransfers={lineTransfers}
        fmt={fmt}
        list={list?.values}
        className={`${DETAIL_PANEL_CLASS} gap-4`}
      />
      <div className={DETAIL_COLUMNS_CLASS}>
        <aside aria-label="Classify and link" className={EDITS_COLUMN}>
          <section aria-labelledby="classification" className={DETAIL_PANEL_CLASS}>
            <h2 id="classification" className={SECTION_TITLE_CLASS}>
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
          {/* A split Transaction is linked by its Split lines, not as a whole (ADR-0005). */}
          {isSplit ? (
            <div className={DETAIL_PANEL_CLASS}>
              <h2 className={SECTION_TITLE_CLASS}>Transfer</h2>
              <p className="text-sm text-muted">Linked line by line, in the Split.</p>
            </div>
          ) : (
            <TransferSection
              transactionId={transaction.id}
              counterpart={counterpart}
              options={
                counterpart ? [] : await listLinkOptions(ctx, transactionSide(transaction.id))
              }
              fmt={fmt}
              list={list?.values}
              className={DETAIL_PANEL_CLASS}
            />
          )}
        </aside>
        <div className="flex min-w-0 flex-col gap-5">
          <BankDetails transaction={transaction} fmt={fmt} className={DETAIL_PANEL_CLASS} />
          <details open className={`${CARD_CLASS} flex flex-col gap-3 px-5 py-4`}>
            <summary className="cursor-pointer text-sm font-semibold text-muted">
              History ({history.length})
            </summary>
            <div className="flex flex-col gap-3 pt-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted">No History for this Transaction.</p>
              ) : (
                <HistoryTimeline entries={history} fmt={fmt} label="Transaction History" />
              )}
              <Link
                href={historyHref({ entityType: 'transaction', entityId: transaction.id })}
                className="text-sm underline"
              >
                Open in History
              </Link>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

interface TransactionActionsProps {
  transaction: TransactionDetail;
  /** The list it was opened from, which deleting it returns to; null for a bare detail. */
  list: SearchValues | null;
}

/** Edit the details of a Manual transaction; delete any Transaction. */
function TransactionActions({ transaction, list }: TransactionActionsProps) {
  return (
    <>
      {transaction.isManual && (
        <Link
          href={`/accounts/${transaction.accountId}/manual/${transaction.id}`}
          className={BUTTON_CLASS}
        >
          Edit details
        </Link>
      )}
      <ActionForm
        action={deleteTransactionFromDetailAction.bind(
          null,
          transaction.id,
          transaction.isManual,
          list,
        )}
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
    </>
  );
}

/** The fields a manual edit locked against Rules, each with an Unlock button (spec 65). */
function LockedFields({ classification }: { classification: Classification }) {
  if (classification.lockedFields.length === 0) {
    return <p className="text-sm text-muted">No field is locked: Rules may classify it.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-soft">Locked against Rules, because you edited them:</p>
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
