import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import {
  cellFromParams,
  queryFromParams,
  queryToParams,
  type UrlParams,
} from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import { splitLabel } from '@/app/transactions/transaction-display';
import { categoryLabel } from '@/lib/classification';
import { getFormatter } from '@/server/formatter';
import { ServiceError } from '@/server/services/errors';
import {
  listCellTransactions,
  type CellRef,
  type CellTransactionPage,
  type ReportHeader,
  type ReportTable,
  type WidgetQueryInput,
} from '@/server/services/reporting';
import { loadReport } from '../load';
import { drillHref } from '../pivot-data';

export const metadata: Metadata = { title: 'Report cell · Finance Manager' };

const CELL = 'px-3 py-2 text-left align-top';

async function loadCell(
  query: WidgetQueryInput,
  cell: CellRef,
): Promise<{ page: CellTransactionPage | null; error: string | null }> {
  try {
    return {
      page: await listCellTransactions(await getServiceContext(), query, cell),
      error: null,
    };
  } catch (error: unknown) {
    if (error instanceof ServiceError) return { page: null, error: error.message };
    throw error;
  }
}

/** "Mar 2025 · Food › Groceries": the labels of the cell's row and column. */
function describeCell(report: ReportTable | null, cell: CellRef): string {
  const label = (headers: ReportHeader[] | undefined, key: string | null | undefined) =>
    key === undefined
      ? null
      : (headers?.find((header) => header.key === key)?.label ?? key ?? 'None');
  const parts = [label(report?.rows, cell.row), label(report?.columns, cell.column)].filter(
    (part): part is string => part !== null,
  );
  return parts.length ? parts.join(' · ') : 'All';
}

/** The Transactions behind one report cell (spec 107); their CHF values add up to the cell. */
export default async function DrillPage({ searchParams }: { searchParams: Promise<UrlParams> }) {
  const params = await searchParams;
  const query = queryFromParams(params);
  const cell = cellFromParams(params);
  const fmt = await getFormatter();
  const [{ report }, { page, error }] = await Promise.all([
    loadReport(query),
    loadCell(query, cell),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Transactions in {describeCell(report, cell)}</h1>
        <Link href={`/reports/builder?${queryToParams(query)}`} className="text-sm underline">
          Back to the report
        </Link>
      </div>
      {error && <FieldError message={error} />}
      {page && (
        <>
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            {page.total} Transaction{page.total === 1 ? '' : 's'}, total{' '}
            {fmt.amount(page.sumChfMinor ?? 0, { currency: 'CHF' })}
          </p>
          <div className="overflow-x-auto">
            <table aria-label="Cell Transactions" className="w-full text-sm">
              <thead className="border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className={CELL}>Date</th>
                  <th className={CELL}>Account</th>
                  <th className={CELL}>Description</th>
                  <th className={CELL}>Payee</th>
                  <th className={CELL}>Category</th>
                  <th className={`${CELL} text-right`}>Amount</th>
                  <th className={`${CELL} text-right`}>CHF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {page.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className={`${CELL} whitespace-nowrap tabular-nums`}>
                      {fmt.date(transaction.bookingDate)}
                    </td>
                    <td className={CELL}>{transaction.accountName}</td>
                    <td className={CELL}>
                      <Link href={`/transactions/${transaction.id}`} className="hover:underline">
                        {transaction.rawDescription || '(no description)'}
                      </Link>
                    </td>
                    <td className={CELL}>{transaction.payee?.name ?? '—'}</td>
                    <td className={CELL}>
                      {transaction.category
                        ? categoryLabel(transaction.category)
                        : (splitLabel(transaction) ?? 'Unclassified')}
                    </td>
                    <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                      {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
                    </td>
                    <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                      {fmt.amount(transaction.chfMinor, { currency: 'CHF' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.pageCount > 1 && report && (
            <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
              {page.page > 1 && (
                <Link href={drillHref(report, { ...cell, page: page.page - 1 })}>Previous</Link>
              )}
              <span>
                Page {page.page} of {page.pageCount}
              </span>
              {page.page < page.pageCount && (
                <Link href={drillHref(report, { ...cell, page: page.page + 1 })}>Next</Link>
              )}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
