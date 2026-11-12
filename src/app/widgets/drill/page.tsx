import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { backLink, originFromParams } from '@/lib/reporting/drill-origin';
import { drillFilterLine, drillHeadline } from '@/lib/reporting/drill-summary';
import { cellFromParams, queryFromParams, type UrlParams } from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import { splitLabel } from '@/app/transactions/transaction-display';
import { categoryLabel } from '@/lib/classification';
import type { Formatter } from '@/lib/format';
import { getFormatter } from '@/server/formatter';
import { ServiceError } from '@/server/services/errors';
import {
  listCellTransactions,
  type CellRef,
  type CellTransaction,
  type CellTransactionPage,
  type ReportHeader,
  type ReportTable,
  type WidgetQueryInput,
} from '@/server/services/reporting';
import { loadQueryFormLists, loadReport } from '../load';
import { drillHref } from '../pivot-data';
import { PAGE_TITLE_CLASS, WARNING_NOTICE_CLASS } from '@/components/surface';

export const metadata: Metadata = { title: 'Drill-down · Finance Manager' };

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

/**
 * The Transactions List filtered to the ones the cell leaves out for want of an FX rate: the
 * cell's dates, and its Account when the Widget is filtered to one.
 */
function unconvertedHref(page: CellTransactionPage, report: ReportTable): string {
  const params = new URLSearchParams({ fxRate: 'missing' });
  if (page.span) {
    params.set('from', page.span.from);
    params.set('to', page.span.to);
  }
  const accounts = report.query.filters.accountIds ?? [];
  if (accounts.length === 1) params.set('accountId', accounts[0]!);
  return `/transactions?${params}`;
}

/**
 * A Drill-down (GLOSSARY): the Transactions behind one reported number, with the number worked
 * out from them, the filters it was counted under, and the way back to where it was opened.
 */
export default async function DrillPage({ searchParams }: { searchParams: Promise<UrlParams> }) {
  const params = await searchParams;
  const query = queryFromParams(params);
  const cell = cellFromParams(params);
  const origin = originFromParams(params);
  const back = backLink(origin, query);
  const fmt = await getFormatter();
  const [{ report }, { page, error }, lists] = await Promise.all([
    loadReport(query),
    loadCell(query, cell),
    loadQueryFormLists(),
  ]);
  const chf = (minor: number) => fmt.amount(minor, { currency: 'CHF' });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className={PAGE_TITLE_CLASS}>Transactions in {describeCell(report, cell)}</h1>
          <Link href={back.href} className="text-sm underline">
            {back.label}
          </Link>
        </div>
        {report && (
          <p aria-label="Filters" className="text-sm text-muted">
            {drillFilterLine(
              report.query,
              lists,
              report.range.from <= report.range.to
                ? `${fmt.date(report.range.from)} to ${fmt.date(report.range.to)}`
                : 'No complete period yet',
            ).join(' · ')}
          </p>
        )}
      </div>
      {error && <FieldError message={error} />}
      {page && (
        <>
          <p role="status" className="text-lg text-ink tabular-nums">
            {drillHeadline(page, chf)}
          </p>
          {page.unconvertedCount > 0 && report && (
            <p role="alert" className={`${WARNING_NOTICE_CLASS} text-sm`}>
              {page.unconvertedCount} Transaction{page.unconvertedCount === 1 ? '' : 's'} left out:
              no FX rate yet.{' '}
              <Link href={unconvertedHref(page, report)} className="underline">
                See {page.unconvertedCount === 1 ? 'it' : 'them'} in Transactions
              </Link>
            </p>
          )}
          <CellTable transactions={page.transactions} fmt={fmt} />
          {page.pageCount > 1 && report && (
            <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
              {page.page > 1 && (
                <Link href={drillHref(report, { ...cell, page: page.page - 1 }, origin)}>
                  Previous
                </Link>
              )}
              <span>
                Page {page.page} of {page.pageCount}
              </span>
              {page.page < page.pageCount && (
                <Link href={drillHref(report, { ...cell, page: page.page + 1 }, origin)}>Next</Link>
              )}
            </nav>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The listed Transactions. "Counted (CHF)" is what each one adds to the number: for a split
 * Transaction, only its lines in the cell, so it can differ from the native Amount.
 */
function CellTable({ transactions, fmt }: { transactions: CellTransaction[]; fmt: Formatter }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Cell Transactions" className="w-full text-sm">
        <thead className="border-b border-rule">
          <tr>
            <th className={CELL}>Date</th>
            <th className={CELL}>Account</th>
            <th className={CELL}>Description</th>
            <th className={CELL}>Payee</th>
            <th className={CELL}>Category</th>
            <th className={`${CELL} text-right`}>Amount</th>
            <th className={`${CELL} text-right`}>Counted (CHF)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {transactions.map((transaction) => (
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
                {transaction.countedLineCount !== null && (
                  <span className="block text-xs text-muted">
                    {transaction.countedLineCount} of {transaction.splitLines.length} lines
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
