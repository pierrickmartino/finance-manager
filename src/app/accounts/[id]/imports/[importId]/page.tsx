import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { getAccount } from '@/server/services/accounts';
import { NotFoundError } from '@/server/services/errors';
import { getImport, listImportTransactions, type Import } from '@/server/services/imports';
import { deleteImportedTransactionAction, undoImportAction } from '../../../../imports/actions';
import { ConfirmActionButton } from '../../../../imports/confirm-action-button';

export const metadata: Metadata = { title: 'Import · Finance Manager' };

const CELL = 'px-3 py-2 text-left align-top';

interface ImportPageProps {
  params: Promise<{ id: string; importId: string }>;
}

async function loadImport(accountId: string, importId: string): Promise<Import> {
  try {
    const found = await getImport(await getServiceContext(), importId);
    if (found.accountId !== accountId) notFound();
    return found;
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** One committed Import (spec 32-34): its Transactions, undo, and deleting one Transaction. */
export default async function ImportPage({ params }: ImportPageProps) {
  const { id, importId } = await params;
  const found = await loadImport(id, importId);
  const ctx = await getServiceContext();
  const [account, transactions, fmt] = await Promise.all([
    getAccount(ctx, found.accountId),
    listImportTransactions(ctx, found.id),
    getFormatter(),
  ]);
  const money = (minor: number) => fmt.amount(minor, { currency: account.currency });
  const historyHref = `/history?entityType=import&entityId=${encodeURIComponent(found.id)}`;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/accounts/${account.id}`} className="text-sm text-zinc-500 hover:underline">
          ← {account.name}
        </Link>
        <h1 className="text-2xl font-semibold">Import {found.fileName}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Imported on {fmt.date(found.importedAt)} · {found.addedCount} added ·{' '}
          {found.duplicateCount} skipped
          {found.undoneAt && <> · Undone on {fmt.date(found.undoneAt)}</>}
        </p>
        <Link href={historyHref} className="text-sm underline">
          History of this Import
        </Link>
      </div>

      {!found.undoneAt && (
        <ConfirmActionButton
          label="Undo import"
          confirmMessage={`Undo this Import? Its ${transactions.length} Transactions are deleted. You can import the file again later.`}
          action={undoImportAction.bind(null, found.id)}
        />
      )}

      {transactions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {found.undoneAt ? 'This Import was undone.' : 'No Transactions left from this Import.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Transactions" className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className={CELL}>Booking date</th>
                <th className={CELL}>Counterparty</th>
                <th className={CELL}>Reference</th>
                <th className={`${CELL} text-right`}>Amount</th>
                <th className={CELL}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className={CELL}>{fmt.date(transaction.bookingDate)}</td>
                  <td className={CELL}>
                    {transaction.counterpartyName ?? transaction.rawDescription}
                    {transaction.paymentReference && (
                      <div className="text-xs text-zinc-500">{transaction.paymentReference}</div>
                    )}
                  </td>
                  <td className={`${CELL} font-mono text-xs`}>
                    {transaction.bankReference ?? '—'}
                  </td>
                  <td className={`${CELL} text-right tabular-nums`}>
                    {money(transaction.amountMinor)}
                  </td>
                  <td className={CELL}>
                    <ConfirmActionButton
                      label="Delete"
                      ariaLabel={`Delete ${transaction.bankReference ?? fmt.date(transaction.bookingDate)}`}
                      confirmMessage="Delete this Transaction? Do it only for a bank error: the rest of the Import stays."
                      action={deleteImportedTransactionAction.bind(null, transaction.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
