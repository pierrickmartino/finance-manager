// PROTOTYPE variant A: the current page (filter rail · table · preview), as the baseline.

import Link from 'next/link';
import { FieldError } from '@/components/form';
import { FilterRail } from '../filter-rail';
import { transactionsHref } from '../search';
import { TransactionList } from '../transaction-list';
import { TransactionPreview } from '../transaction-preview';
import type { VariantProps } from './shared';

export const VARIANT_A_NAME = 'Current: rail · table · preview';

export function VariantA({ fmt, values, lists, page, error, selected }: VariantProps) {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <FilterRail values={values} lists={lists} />
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
                  values={values}
                  page={page.page}
                  selectedId={selected?.id ?? null}
                />
                {page.pageCount > 1 && (
                  <nav className="flex gap-4 text-sm">
                    {page.page > 1 && (
                      <Link href={transactionsHref(values, page.page - 1)} className="underline">
                        Previous
                      </Link>
                    )}
                    <span>
                      Page {page.page} of {page.pageCount}
                    </span>
                    {page.page < page.pageCount && (
                      <Link href={transactionsHref(values, page.page + 1)} className="underline">
                        Next
                      </Link>
                    )}
                  </nav>
                )}
              </>
            ))}
        </div>
        {selected && <TransactionPreview fmt={fmt} transaction={selected} />}
      </div>
    </section>
  );
}
