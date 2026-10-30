import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Formatter } from '@/lib/format';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS } from '@/components/named-list';
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
import { HistoryTable, historyHref } from '../../history/history-table';
import {
  deleteTransactionFromDetailAction,
  editClassificationAction,
  unlockFieldAction,
} from './actions';
import { ClassificationForm } from './classification-form';

export const metadata: Metadata = { title: 'Transaction · Finance Manager' };

const CELL = 'px-3 py-2 text-left';

interface TransactionPageProps {
  params: Promise<{ id: string }>;
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
 * One Transaction (spec 38, 48, 63-65, 116): every bank field read-only, where it came from, its
 * classification with the fields locked against Rules, and its History.
 */
export default async function TransactionPage({ params }: TransactionPageProps) {
  const { id } = await params;
  const transaction = await loadTransaction(id);
  const ctx = await getServiceContext();
  const [history, fmt, classification, groups, payees, tags] = await Promise.all([
    listHistory(ctx, { entityType: 'transaction', entityId: transaction.id }),
    getFormatter(),
    getClassification(ctx, transaction.id),
    listCategoryGroups(ctx),
    listPayees(ctx),
    listTags(ctx),
  ]);
  const amount = fmt.amount(transaction.amountMinor, { currency: transaction.currency });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/transactions" className="text-sm text-zinc-500 hover:underline">
          ← Transactions
        </Link>
        <h1 className="text-2xl font-semibold">
          {transaction.rawDescription || '(no description)'}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="tabular-nums">{amount}</span> on {fmt.date(transaction.bookingDate)} ·{' '}
          <Link href={`/accounts/${transaction.accountId}`} className="underline">
            {transaction.accountName}
          </Link>
        </p>
      </div>

      <section aria-labelledby="bank-fields" className="flex flex-col gap-3">
        <h2 id="bank-fields" className="text-lg font-semibold">
          {transaction.isManual ? 'Details' : 'From the bank'}
        </h2>
        <BankFields transaction={transaction} amount={amount} fmt={fmt} />
        {transaction.bundledDetails && transaction.bundledDetails.length > 0 && (
          <BundledDetails transaction={transaction} fmt={fmt} />
        )}
      </section>

      <section aria-labelledby="classification" className="flex flex-col gap-3">
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
      </section>

      <div className="flex items-start gap-3">
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
          )}
          label="Delete Transaction"
          confirmMessage={
            transaction.isManual
              ? 'Delete this Manual transaction?'
              : 'Delete this Transaction? Importing its file again adds it back.'
          }
        >
          <button type="submit" className={BUTTON_CLASS}>
            Delete Transaction
          </button>
        </ActionForm>
      </div>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-lg font-semibold">
          History
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500">No History for this Transaction.</p>
        ) : (
          <HistoryTable entries={history} fmt={fmt} label="Transaction History" />
        )}
        <Link
          href={historyHref({ entityType: 'transaction', entityId: transaction.id })}
          className="text-sm underline"
        >
          Open in History
        </Link>
      </section>
    </section>
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

interface BankFieldsProps {
  transaction: TransactionDetail;
  amount: string;
  fmt: Formatter;
}

function BankFields({ transaction, amount, fmt }: BankFieldsProps) {
  const source = transaction.import ? (
    <>
      Import of {transaction.import.fileName} on {fmt.date(transaction.import.importedAt)}
    </>
  ) : (
    'Manual'
  );
  return (
    <dl
      aria-label="Bank fields"
      className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm"
    >
      <Item term="Booking date">{fmt.date(transaction.bookingDate)}</Item>
      <Item term="Value date">{transaction.valueDate && fmt.date(transaction.valueDate)}</Item>
      <Item term="Amount">
        <span className="tabular-nums">{amount}</span>
      </Item>
      <Item term="Description">
        <span className="whitespace-pre-wrap">{transaction.rawDescription}</span>
      </Item>
      <Item term="Counterparty">{transaction.counterpartyName}</Item>
      <Item term="Counterparty IBAN">
        {transaction.counterpartyIban && (
          <span className="font-mono">{transaction.counterpartyIban}</span>
        )}
      </Item>
      <Item term="Payment reference">{transaction.paymentReference}</Item>
      <Item term="Bank reference">{transaction.bankReference}</Item>
      <Item term="Source">{source}</Item>
    </dl>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{term}</dt>
      <dd className="break-words">{children || '—'}</dd>
    </>
  );
}

interface BundledDetailsProps {
  transaction: TransactionDetail;
  fmt: Formatter;
}

/** The payments a bank bundled into this one entry, for information only (spec 28). */
function BundledDetails({ transaction, fmt }: BundledDetailsProps) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Bundled details" className="w-full text-sm">
        <thead className="border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className={CELL}>Counterparty</th>
            <th className={CELL}>IBAN</th>
            <th className={CELL}>Reference</th>
            <th className={`${CELL} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {(transaction.bundledDetails ?? []).map((detail, index) => (
            <tr key={index}>
              <td className={CELL}>{detail.counterpartyName ?? '—'}</td>
              <td className={`${CELL} font-mono`}>{detail.counterpartyIban ?? '—'}</td>
              <td className={CELL}>{detail.paymentReference ?? '—'}</td>
              <td className={`${CELL} text-right tabular-nums`}>
                {detail.amountMinor === null
                  ? '—'
                  : fmt.amount(detail.amountMinor, { currency: transaction.currency })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
