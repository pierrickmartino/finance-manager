import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Formatter } from '@/lib/format';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { NotFoundError } from '@/server/services/errors';
import { listHistory } from '@/server/services/history';
import { getTransaction, type TransactionDetail } from '@/server/services/transactions';
import { HistoryTable, historyHref } from '../../history/history-table';

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
 * One Transaction (spec 38, 48, 116): every bank field read-only, where it came from, and its
 * History. #15 adds a classification section (Payee, Category, Tags, notes) and a delete button
 * between the bank fields and the History.
 */
export default async function TransactionPage({ params }: TransactionPageProps) {
  const { id } = await params;
  const transaction = await loadTransaction(id);
  const ctx = await getServiceContext();
  const [history, fmt] = await Promise.all([
    listHistory(ctx, { entityType: 'transaction', entityId: transaction.id }),
    getFormatter(),
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
