import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { getAccount } from '@/server/services/accounts';
import { NotFoundError } from '@/server/services/errors';
import { getImportPreview, type EntryStatus, type ImportPreview } from '@/server/services/imports';
import { commitImportAction, discardImportAction } from '../actions';
import { ReconciliationSummary } from '../reconciliation-summary';
import { CommitImportForm } from './commit-import-form';
import { NearDuplicates } from './near-duplicates';

export const metadata: Metadata = { title: 'Import preview · Finance Manager' };

const CELL = 'px-3 py-2 text-left align-top';

const STATUS_LABELS: Record<EntryStatus, string> = {
  new: 'New',
  duplicate: 'Already imported',
  near_duplicate: 'Possible duplicate',
};

const STATUS_CLASSES: Record<EntryStatus, string | undefined> = {
  new: undefined,
  duplicate: 'text-zinc-500',
  near_duplicate: 'bg-amber-50 dark:bg-amber-950',
};

interface PreviewPageProps {
  params: Promise<{ previewId: string }>;
}

async function loadPreview(previewId: string): Promise<ImportPreview> {
  try {
    return await getImportPreview(await getServiceContext(), previewId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export default async function ImportPreviewPage({ params }: PreviewPageProps) {
  const { previewId } = await params;
  const preview = await loadPreview(previewId);
  const [account, fmt] = await Promise.all([
    getAccount(await getServiceContext(), preview.accountId),
    getFormatter(),
  ]);
  const money = (minor: number | null) =>
    minor === null ? '—' : fmt.amount(minor, { currency: account.currency });
  const { statement, counts } = preview;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/accounts/${account.id}`} className="text-sm text-zinc-500 hover:underline">
          ← {account.name}
        </Link>
        <h1 className="text-2xl font-semibold">Import preview</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {preview.fileName} into {account.name}
          {statement.from && statement.to && (
            <>
              {' '}
              · {fmt.date(statement.from)} – {fmt.date(statement.to)}
            </>
          )}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-zinc-500">Opening balance</dt>
        <dd className="tabular-nums">{money(statement.openingBalanceMinor)}</dd>
        <dt className="text-zinc-500">Closing balance</dt>
        <dd className="tabular-nums">{money(statement.closingBalanceMinor)}</dd>
        <dt className="text-zinc-500">New</dt>
        <dd>{counts.new}</dd>
        <dt className="text-zinc-500">Already imported (skipped)</dt>
        <dd>{counts.duplicate}</dd>
        <dt className="text-zinc-500">Possible duplicates</dt>
        <dd>{counts.nearDuplicate}</dd>
      </dl>

      <ReconciliationSummary
        reconciliation={preview.reconciliation}
        currency={account.currency}
        fmt={fmt}
      />

      <div className="overflow-x-auto">
        <table aria-label="Entries" className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className={CELL}>Booking date</th>
              <th className={CELL}>Counterparty</th>
              <th className={CELL}>Reference</th>
              <th className={`${CELL} text-right`}>Amount</th>
              <th className={CELL}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {preview.entries.map((entry) => (
              <tr key={entry.fingerprint} className={STATUS_CLASSES[entry.status]}>
                <td className={CELL}>{fmt.date(entry.bookingDate)}</td>
                <td className={CELL}>
                  {entry.counterpartyName ?? '—'}
                  {entry.paymentReference && (
                    <div className="text-xs text-zinc-500">{entry.paymentReference}</div>
                  )}
                  {entry.counterpartyIban && (
                    <div className="font-mono text-xs text-zinc-500">{entry.counterpartyIban}</div>
                  )}
                </td>
                <td className={`${CELL} font-mono text-xs`}>{entry.bankReference ?? '—'}</td>
                <td className={`${CELL} text-right tabular-nums`}>{money(entry.amountMinor)}</td>
                <td className={CELL}>{STATUS_LABELS[entry.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CommitImportForm
        proposedOpening={
          preview.proposedOpeningBalance
            ? `${money(preview.proposedOpeningBalance.amountMinor)} on ${fmt.date(preview.proposedOpeningBalance.date)}`
            : null
        }
        newCount={counts.new}
        commit={commitImportAction.bind(null, preview.id)}
        discard={discardImportAction.bind(null, preview.id, account.id)}
      >
        <NearDuplicates
          entries={preview.entries.filter((entry) => entry.status === 'near_duplicate')}
          currency={account.currency}
          fmt={fmt}
        />
      </CommitImportForm>
    </section>
  );
}
