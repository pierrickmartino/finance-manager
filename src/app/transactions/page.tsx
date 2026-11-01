import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listAccounts } from '@/server/services/accounts';
import { listCategoryGroups } from '@/server/services/categories';
import { listPayees } from '@/server/services/payees';
import { listTags } from '@/server/services/tags';
import { ServiceError } from '@/server/services/errors';
import {
  listTransactions,
  type TransactionPage,
  type TransactionQuery,
} from '@/server/services/transactions';
import { FilterRail } from './filter-rail';
import { pickSelected, readTransactionSearch, transactionsHref, type SearchValues } from './search';
import { TransactionList } from './transaction-list';
import { TransactionPreview } from './transaction-preview';

export const metadata: Metadata = { title: 'Transactions · Finance Manager' };

interface TransactionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadPage(
  query: TransactionQuery | null,
): Promise<{ page: TransactionPage | null; error: string | null }> {
  if (!query) return { page: null, error: null };
  try {
    return { page: await listTransactions(await getServiceContext(), query), error: null };
  } catch (error: unknown) {
    if (error instanceof ServiceError) return { page: null, error: error.message };
    throw error;
  }
}

/**
 * Master / detail: the filters in a rail, the matching Transactions, and (from `xl` up) a
 * preview of the selected one, so reviewing many Transactions never leaves the page.
 */
export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const fmt = await getFormatter();
  const search = readTransactionSearch(await searchParams, fmt.settings.numberFormat);
  const ctx = await getServiceContext();
  const [{ page, error: queryError }, accounts, groups, payees, tags] = await Promise.all([
    loadPage(search.query),
    listAccounts(ctx),
    listCategoryGroups(ctx),
    listPayees(ctx),
    listTags(ctx),
  ]);
  const error = search.error ?? queryError;
  const selected = page && pickSelected(page.transactions, search.selected);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <FilterRail values={search.values} lists={{ accounts, groups, payees, tags }} />

        <div className="flex min-w-0 flex-col gap-3">
          {error && <FieldError message={error} />}
          {page &&
            (page.transactions.length === 0 ? (
              <p className="text-sm text-zinc-500">No Transactions match.</p>
            ) : (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {page.total} Transaction{page.total === 1 ? '' : 's'}
                </p>
                <TransactionList
                  fmt={fmt}
                  transactions={page.transactions}
                  values={search.values}
                  page={page.page}
                  selectedId={selected?.id ?? null}
                />
                <Pagination values={search.values} page={page} />
              </>
            ))}
        </div>

        {selected && <TransactionPreview fmt={fmt} transaction={selected} />}
      </div>
    </section>
  );
}

interface PaginationProps {
  values: SearchValues;
  page: TransactionPage;
}

function Pagination({ values, page }: PaginationProps) {
  if (page.pageCount <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
      {page.page > 1 ? (
        <Link href={transactionsHref(values, page.page - 1)} className="underline">
          Previous
        </Link>
      ) : (
        <span className="text-zinc-400">Previous</span>
      )}
      <span>
        Page {page.page} of {page.pageCount}
      </span>
      {page.page < page.pageCount ? (
        <Link href={transactionsHref(values, page.page + 1)} className="underline">
          Next
        </Link>
      ) : (
        <span className="text-zinc-400">Next</span>
      )}
    </nav>
  );
}
