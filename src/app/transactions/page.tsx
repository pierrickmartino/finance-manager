import type { Metadata } from 'next';
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listAccounts, type Account } from '@/server/services/accounts';
import { ServiceError } from '@/server/services/errors';
import {
  listTransactions,
  type TransactionPage,
  type TransactionQuery,
} from '@/server/services/transactions';
import { readTransactionSearch, transactionsHref, type SearchValues } from './search';

export const metadata: Metadata = { title: 'Transactions · Finance Manager' };

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const CELL = 'px-3 py-2 text-left align-top';

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

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const fmt = await getFormatter();
  const search = readTransactionSearch(await searchParams, fmt.settings.numberFormat);
  const [{ page, error: queryError }, accounts] = await Promise.all([
    loadPage(search.query),
    listAccounts(await getServiceContext()),
  ]);
  const error = search.error ?? queryError;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>

      <SearchForm values={search.values} accounts={accounts} />

      {error && <FieldError message={error} />}

      {page &&
        (page.transactions.length === 0 ? (
          <p className="text-sm text-zinc-500">No Transactions match.</p>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {page.total} Transaction{page.total === 1 ? '' : 's'}
            </p>
            <div className="overflow-x-auto">
              <table aria-label="Transactions" className="w-full text-sm">
                <thead className="border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className={CELL}>Date</th>
                    <th className={CELL}>Account</th>
                    <th className={CELL}>Description</th>
                    <th className={`${CELL} text-right`}>Amount</th>
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
                        {transaction.counterpartyName && (
                          <div className="text-xs text-zinc-500">
                            {transaction.counterpartyName}
                          </div>
                        )}
                        {transaction.isManual && (
                          <div className="text-xs text-zinc-500">Manual</div>
                        )}
                      </td>
                      <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                        {fmt.amount(transaction.amountMinor, { currency: transaction.currency })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination values={search.values} page={page} />
          </>
        ))}
    </section>
  );
}

interface SearchFormProps {
  values: SearchValues;
  accounts: Account[];
}

function SearchForm({ values, accounts }: SearchFormProps) {
  return (
    // Keyed on the values so the fields follow client-side navigation between searches.
    <form
      key={JSON.stringify(values)}
      method="get"
      action="/transactions"
      aria-label="Search Transactions"
      className="flex flex-wrap items-end gap-3"
    >
      <Field
        label="Search"
        name="text"
        value={values.text}
        placeholder="Description, name, reference"
      />
      <Field label="From" name="from" type="date" value={values.from} />
      <Field label="To" name="to" type="date" value={values.to} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Account
        <select name="accountId" defaultValue={values.accountId} className={INPUT}>
          <option value="">All</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <Field label="Amount from" name="amountMin" value={values.amountMin} />
      <Field label="Amount to" name="amountMax" value={values.amountMax} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Status
        <select name="status" defaultValue={values.status} className={INPUT}>
          <option value="">All</option>
          <option value="imported">Imported</option>
          <option value="manual">Manual</option>
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Search
      </button>
      <Link href="/transactions" className="py-1.5 text-sm underline">
        Clear
      </Link>
      <p className="w-full text-xs text-zinc-500">
        Amounts are signed: expenses are negative, so &quot;Amount to&quot; 0 lists only expenses.
      </p>
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  value: string;
  type?: string;
  placeholder?: string;
}

function Field({ label, name, value, type = 'text', placeholder }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        className={INPUT}
      />
    </label>
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
