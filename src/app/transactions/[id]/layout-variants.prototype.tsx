/**
 * PROTOTYPE: throwaway. Three layouts of /transactions/[id] that give the Split more room,
 * switchable with `?variant=` (see page.tsx and the floating PrototypeSwitcher):
 *
 * - A "Split stage": a one-line header, then the Split as a full-width spreadsheet, the rest
 *   in a row of cards beneath it.
 * - B "Tabs": a one-line header, then one full-width tab at a time (Split first).
 * - C "Ticket stub": the receipt and Classification in a narrow sticky stub on the left, the
 *   Split as large per-line cards filling the wide right column.
 *
 * Every variant edits the Split inline (no "Edit Split" disclosure) with SplitWorkbench, whose
 * save is stubbed. Classification, Transfer and delete still use the real forms.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
import { CARD_CLASS, DANGER_BUTTON_CLASS } from '@/components/surface';
import type { Formatter } from '@/lib/format';
import type { CategoryGroup } from '@/server/services/categories';
import type { HistoryEntry } from '@/server/services/history';
import type { PayeeRef } from '@/server/services/payees';
import type { Classification, TransactionDetail } from '@/server/services/transactions';
import type { TransferSideView } from '@/server/services/transfers';
import { historyHref } from '../../history/history-table';
import { HistoryTimeline } from '../../history/history-timeline';
import { amountClass, splitLabel, transactionName } from '../transaction-display';
import { deleteTransactionFromDetailAction, editClassificationAction } from './actions';
import { ClassificationForm } from './classification-form';
import type { LineTransfers } from './split-section';
import { initialSplitDrafts } from './split-lines';
import { SplitWorkbench } from './split-workbench.prototype';
import type { StatusBadge } from './transaction-badges';
import { TransactionReceipt } from './transaction-receipt';
import { TransferCounterpart, TransferSection } from './transfer-section';

export const LAYOUT_VARIANTS = [
  { key: 'current', name: 'Current layout' },
  { key: 'A', name: 'Split stage' },
  { key: 'B', name: 'Tabs' },
  { key: 'C', name: 'Ticket stub' },
];

export interface VariantData {
  transaction: TransactionDetail;
  classification: Classification;
  badges: StatusBadge[];
  history: HistoryEntry[];
  groups: CategoryGroup[];
  payees: PayeeRef[];
  tagNames: string[];
  counterpart: TransferSideView | null;
  linkOptions: TransferSideView[];
  lineTransfers: LineTransfers;
  fmt: Formatter;
  tab?: string;
}

const PANEL = `${CARD_CLASS} flex flex-col gap-3 p-5`;
const BADGE_TONE: Record<StatusBadge['tone'], string> = {
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  positive: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

/* ---------- shared bits (small, so each variant keeps its own layout) ---------- */

function Workbench({ data, layout }: { data: VariantData; layout: 'grid' | 'cards' }) {
  const { transaction, fmt, payees } = data;
  if (transaction.splitLines.length === 0 && transaction.transferId) {
    return (
      <p className="text-sm text-zinc-500">
        This Transaction is a Transfer: unlink it to split it.
      </p>
    );
  }
  const transfers = Object.fromEntries(
    Object.entries(data.lineTransfers).flatMap(([lineId, { counterpart }]) =>
      counterpart
        ? [[lineId, <TransferCounterpart key={lineId} counterpart={counterpart} fmt={fmt} />]]
        : [],
    ),
  );
  return (
    <SplitWorkbench
      layout={layout}
      amountMinor={transaction.amountMinor}
      currency={transaction.currency}
      initialLines={initialSplitDrafts(transaction, fmt.settings.numberFormat, payees)}
      groups={data.groups}
      payees={payees}
      transactionPayee={transaction.payee?.name ?? null}
      transfers={transfers}
      isSplit={transaction.splitLines.length > 0}
    />
  );
}

function Classify({ data }: { data: VariantData }) {
  return (
    <>
      <ClassificationForm
        classification={data.classification}
        groups={data.groups}
        payeeNames={data.payees.map((payee) => payee.name)}
        tagNames={data.tagNames}
        action={editClassificationAction.bind(null, data.transaction.id)}
      />
      <Link
        href={`/rules/new?fromTransaction=${data.transaction.id}`}
        className="text-sm underline"
      >
        Create rule from this Transaction
      </Link>
    </>
  );
}

function Transfer({ data, className }: { data: VariantData; className?: string }) {
  if (data.transaction.splitLines.length > 0) {
    return (
      <div className={className}>
        <h2 className="text-lg font-semibold">Transfer</h2>
        <p className="text-sm text-zinc-500">
          A split Transaction is linked by its Split lines, in the Split above.
        </p>
      </div>
    );
  }
  return (
    <TransferSection
      transactionId={data.transaction.id}
      counterpart={data.counterpart}
      options={data.linkOptions}
      fmt={data.fmt}
      className={className}
    />
  );
}

function BankFields({ data }: { data: VariantData }) {
  const { transaction: t, fmt } = data;
  const rows: [string, ReactNode][] = [
    ['Value date', t.valueDate && fmt.date(t.valueDate)],
    [
      'Description',
      t.rawDescription && <span className="font-mono text-xs">{t.rawDescription}</span>,
    ],
    ['Counterparty', t.counterpartyName],
    [
      'Counterparty IBAN',
      t.counterpartyIban && <span className="font-mono">{t.counterpartyIban}</span>,
    ],
    ['Payment reference', t.paymentReference],
    ['Bank reference', t.bankReference],
    ['Source', t.import ? `Import of ${t.import.fileName}` : 'Manual'],
  ];
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-zinc-500">{term}</dt>
          <dd className="break-words">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function History({ data }: { data: VariantData }) {
  return (
    <div className="flex flex-col gap-3">
      {data.history.length === 0 ? (
        <p className="text-sm text-zinc-500">No History for this Transaction.</p>
      ) : (
        <HistoryTimeline entries={data.history} fmt={data.fmt} label="Transaction History" />
      )}
      <Link
        href={historyHref({ entityType: 'transaction', entityId: data.transaction.id })}
        className="text-sm underline"
      >
        Open in History
      </Link>
    </div>
  );
}

function Actions({ transaction }: { transaction: TransactionDetail }) {
  return (
    <div className="flex items-center gap-3">
      {transaction.isManual && (
        <Link
          href={`/accounts/${transaction.accountId}/manual/${transaction.id}`}
          className={BUTTON_CLASS}
        >
          Edit details
        </Link>
      )}
      <ActionForm
        action={deleteTransactionFromDetailAction.bind(null, transaction.id, transaction.isManual)}
        label="Delete Transaction"
        confirmMessage="Delete this Transaction?"
      >
        <button type="submit" className={DANGER_BUTTON_CLASS}>
          Delete
        </button>
      </ActionForm>
    </div>
  );
}

/** Name, amount, date, Account and status on one line. */
function HeaderStrip({ data }: { data: VariantData }) {
  const { transaction, fmt, badges } = data;
  const name = transactionName(transaction);
  return (
    <header className={`${CARD_CLASS} flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4`}>
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        <h1 className="truncate text-lg font-semibold">{name}</h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          {fmt.date(transaction.bookingDate)} ·
          <Link href={`/accounts/${transaction.accountId}`} className="underline">
            {transaction.accountName}
          </Link>
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONE[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
        </p>
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${amountClass(transaction.amountMinor)}`}>
        {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
      </p>
      <Actions transaction={transaction} />
    </header>
  );
}

function SplitHeading({ data }: { data: VariantData }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold">{splitLabel(data.transaction) ?? 'Split'}</h2>
      {data.transaction.splitLines.length === 0 && (
        <p className="text-sm text-zinc-500">
          Divide the amount into lines that add up to it, each with its own Category.
        </p>
      )}
    </div>
  );
}

/* ---------- A: Split stage ---------- */

export function VariantA({ data }: { data: VariantData }) {
  return (
    <div className="flex flex-col gap-5">
      <HeaderStrip data={data} />
      <section aria-label="Split" className={`${PANEL} gap-4`}>
        <SplitHeading data={data} />
        <Workbench data={data} layout="grid" />
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section aria-label="Classification" className={PANEL}>
          <h2 className="text-lg font-semibold">Classification</h2>
          <Classify data={data} />
        </section>
        <Transfer data={data} className={PANEL} />
        <section aria-label="From the bank" className={PANEL}>
          <h2 className="text-lg font-semibold">
            {data.transaction.isManual ? 'Details' : 'From the bank'}
          </h2>
          <BankFields data={data} />
        </section>
      </div>
      <details className={`${PANEL} group`}>
        <summary className="cursor-pointer text-sm font-semibold text-zinc-500">
          History ({data.history.length})
        </summary>
        <History data={data} />
      </details>
    </div>
  );
}

/* ---------- B: Tabs ---------- */

const TABS = [
  { key: 'split', label: 'Split' },
  { key: 'classification', label: 'Classification' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'bank', label: 'From the bank' },
  { key: 'history', label: 'History' },
];

export function VariantB({ data }: { data: VariantData }) {
  const tab = TABS.some((item) => item.key === data.tab) ? data.tab : 'split';
  const lineCount = data.transaction.splitLines.length;
  return (
    <div className="flex flex-col gap-4">
      <HeaderStrip data={data} />
      <nav
        aria-label="Transaction sections"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`?variant=B&tab=${item.key}`}
            replace
            scroll={false}
            aria-current={tab === item.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === item.key
                ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {item.label}
            {item.key === 'split' && lineCount > 0 && (
              <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 text-xs dark:bg-zinc-800">
                {lineCount}
              </span>
            )}
            {item.key === 'history' && (
              <span className="ml-1.5 text-xs text-zinc-400">{data.history.length}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className={`${PANEL} min-h-[24rem] gap-4`}>
        {tab === 'split' && (
          <>
            <SplitHeading data={data} />
            <Workbench data={data} layout="grid" />
          </>
        )}
        {tab === 'classification' && (
          <div className="max-w-xl">
            <Classify data={data} />
          </div>
        )}
        {tab === 'transfer' && <Transfer data={data} className="flex max-w-xl flex-col gap-3" />}
        {tab === 'bank' && <BankFields data={data} />}
        {tab === 'history' && <History data={data} />}
      </div>
    </div>
  );
}

/* ---------- C: Ticket stub ---------- */

export function VariantC({ data }: { data: VariantData }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside
        aria-label="The Transaction"
        className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
      >
        <TransactionReceipt transaction={data.transaction} badges={data.badges} fmt={data.fmt} />
        <details className={PANEL}>
          <summary className="cursor-pointer font-semibold">Classification</summary>
          <Classify data={data} />
        </details>
        <Actions transaction={data.transaction} />
      </aside>
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-label="Split" className={`${PANEL} gap-4 p-6`}>
          <SplitHeading data={data} />
          <Workbench data={data} layout="cards" />
        </section>
        <Transfer data={data} className={PANEL} />
        <section aria-label="History" className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-500">History</h2>
          <History data={data} />
        </section>
      </div>
    </div>
  );
}
