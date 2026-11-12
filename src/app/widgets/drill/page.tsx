import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { drillUrl, unconvertedUrl, type DrillTarget } from '@/lib/reporting/drill-link';
import { backLink, originFromParams, type BackLink } from '@/lib/reporting/drill-origin';
import {
  changeWorking,
  drillFilterLine,
  drillHeadline,
  plural,
} from '@/lib/reporting/drill-summary';
import { cellFromParams, queryFromParams, type UrlParams } from '@/lib/reporting/widget-params';
import { getServiceContext } from '@/server/app-context';
import { splitLabel } from '@/app/transactions/transaction-display';
import { categoryLabel } from '@/lib/classification';
import type { Formatter } from '@/lib/format';
import { getFormatter } from '@/server/formatter';
import { ServiceError } from '@/server/services/errors';
import {
  ends,
  isExcept,
  isTimeAxis,
  keptBy,
  listCellTransactions,
  type AxisSelector,
  type CellRef,
  type ReportAxis,
  type CellTransaction,
  type CellTransactionPage,
  type ReportHeader,
  type ReportTable,
  type WidgetQueryInput,
} from '@/server/services/reporting';
import { loadQueryFormLists, loadReport } from '../load';
import type { QueryFormLists } from '../query-form';
import { PAGE_TITLE_CLASS, WARNING_NOTICE_CLASS } from '@/components/surface';

export const metadata: Metadata = { title: 'Drill-down · Finance Manager' };

const CELL = 'px-3 py-2 text-left align-top';

type Chf = (minor: number) => string;

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

/** At most this many names in "All but …"; past it, "Other", as the chart calls it. */
const EXCEPT_NAMES = 2;

const headerLabel = (headers: ReportHeader[] | undefined, key: string | null): string =>
  headers?.find((header) => header.key === key)?.label ?? key ?? 'None';

/**
 * One axis of the cell in words: its key's label; for every key but some, the periods kept on
 * a time axis ("Jan 2025 to Feb 2025"), else "All but Rent" or "Other".
 */
function describeSelector(
  headers: ReportHeader[] | undefined,
  axis: ReportAxis | null | undefined,
  selector: AxisSelector | undefined,
): string | null {
  if (selector === undefined) return null;
  if (!isExcept(selector)) return headerLabel(headers, selector);
  const kept = ends(keptBy(headers ?? [], (header) => header.key, selector));
  if (isTimeAxis(axis ?? null) && kept) {
    const [first, last] = kept;
    return first === last ? first.label : `${first.label} to ${last.label}`;
  }
  if (selector.except.length === 0) return 'All';
  if (selector.except.length > EXCEPT_NAMES) return 'Other';
  return `All but ${selector.except.map((key) => headerLabel(headers, key)).join(', ')}`;
}

/** "Mar 2025 · Food › Groceries": the labels of the cell's row and column. */
function describeCell(report: ReportTable | null, cell: CellRef): string {
  const parts = [
    describeSelector(report?.rows, report?.query.rows, cell.row),
    describeSelector(report?.columns, report?.query.columns, cell.column),
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : 'All';
}

/** The change a cell's subtotals work out, each period by its label. */
function changeLine(
  page: CellTransactionPage,
  report: ReportTable | null,
  chf: Chf,
): string | null {
  if (!page.subtotals) return null;
  const labelled = page.subtotals.map((period) => ({
    label: headerLabel(report?.rows, period.key),
    sumChfMinor: period.sumChfMinor,
  }));
  return changeWorking(labelled, chf);
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
  const fmt = await getFormatter();
  const [{ report }, { page, error }, lists] = await Promise.all([
    loadReport(query),
    loadCell(query, cell),
    loadQueryFormLists(),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className={PAGE_TITLE_CLASS}>Transactions in {describeCell(report, cell)}</h1>
          <BackTo {...backLink(origin, query)} />
        </div>
        {report && <FilterLine report={report} lists={lists} fmt={fmt} />}
      </div>
      {error && <FieldError message={error} />}
      {page && (
        <DrillBody
          page={page}
          report={report}
          drill={report && { query: report.query, origin }}
          cell={cell}
          fmt={fmt}
        />
      )}
    </section>
  );
}

function BackTo({ href, label }: BackLink) {
  return (
    <Link href={href} className="text-sm underline">
      {label}
    </Link>
  );
}

interface FilterLineProps {
  report: ReportTable;
  lists: QueryFormLists;
  fmt: Formatter;
}

/** The period and the filters the number was counted under. */
function FilterLine({ report, lists, fmt }: FilterLineProps) {
  const { from, to } = report.range;
  const period = from <= to ? `${fmt.date(from)} to ${fmt.date(to)}` : 'No complete period yet';
  return (
    <p aria-label="Filters" className="text-sm text-muted">
      {drillFilterLine(report.query, lists, period).join(' · ')}
    </p>
  );
}

interface DrillBodyProps {
  page: CellTransactionPage;
  report: ReportTable | null;
  /** Where the other pages of the Drill-down lead; null without a report. */
  drill: DrillTarget | null;
  cell: CellRef;
  fmt: Formatter;
}

/** The number worked out, what it leaves out, and its Transactions, page by page. */
function DrillBody({ page, report, drill, cell, fmt }: DrillBodyProps) {
  const chf: Chf = (minor) => fmt.amount(minor, { currency: 'CHF' });
  const change = changeLine(page, report, chf);
  return (
    <>
      <p role="status" className="text-lg text-ink tabular-nums">
        {change ?? drillHeadline(page, chf)}
      </p>
      {change && (
        <p className="-mt-4 text-sm text-muted tabular-nums">{drillHeadline(page, chf)}</p>
      )}
      {page.unconvertedCount > 0 && report && (
        <UnconvertedNotice
          count={page.unconvertedCount}
          href={unconvertedUrl(report.query, cell, page.span)}
        />
      )}
      <CellTable transactions={page.transactions} fmt={fmt} />
      {page.pageCount > 1 && drill && (
        <Pager page={page} hrefOf={(number) => drillUrl(drill, { ...cell, page: number })} />
      )}
    </>
  );
}

/** How many Transactions the number leaves out for want of an FX rate, and where to see them. */
function UnconvertedNotice({ count, href }: { count: number; href: string }) {
  return (
    <p role="alert" className={`${WARNING_NOTICE_CLASS} text-sm`}>
      {plural(count, 'Transaction')} left out: no FX rate yet.{' '}
      <Link href={href} className="underline">
        See {count === 1 ? 'it' : 'them'} in Transactions
      </Link>
    </p>
  );
}

interface PagerProps {
  page: CellTransactionPage;
  hrefOf: (page: number) => string;
}

function Pager({ page, hrefOf }: PagerProps) {
  return (
    <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
      {page.page > 1 && <Link href={hrefOf(page.page - 1)}>Previous</Link>}
      <span>
        Page {page.page} of {page.pageCount}
      </span>
      {page.page < page.pageCount && <Link href={hrefOf(page.page + 1)}>Next</Link>}
    </nav>
  );
}

/**
 * The listed Transactions. "Counted (CHF)" is what each one adds to the number: for a split
 * Transaction, only its lines in the cell, so it can differ from the native Amount.
 */
function CellTable({ transactions, fmt }: { transactions: CellTransaction[]; fmt: Formatter }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Drill-down Transactions" className="w-full text-sm">
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
