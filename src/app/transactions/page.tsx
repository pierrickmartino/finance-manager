import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { FieldError } from '@/components/form';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { listAccounts, type Account } from '@/server/services/accounts';
import {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
  listCategoryGroups,
  type CategoryGroup,
} from '@/server/services/categories';
import { listPayees, type Payee } from '@/server/services/payees';
import { listTags, type Tag } from '@/server/services/tags';
import { ServiceError } from '@/server/services/errors';
import {
  listTransactions,
  type TransactionPage,
  type TransactionQuery,
} from '@/server/services/transactions';
import {
  readTransactionSearch,
  transactionsExportHref,
  transactionsHref,
  type SearchValues,
} from './search';
// PROTOTYPE — throwaway `?variant=` switch; see ./_prototype/shared.tsx.
import { VariantA, NAME as NAME_A } from './_prototype/variant-a-ledger';
import { VariantB, NAME as NAME_B } from './_prototype/variant-b-feed';
import { VariantC, NAME as NAME_C } from './_prototype/variant-c-workbench';

const PROTOTYPE_VARIANTS = [
  { key: 'current', name: 'Today' },
  { key: 'A', name: NAME_A },
  { key: 'B', name: NAME_B },
  { key: 'C', name: NAME_C },
];

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
  const params = await searchParams;
  const search = readTransactionSearch(params, fmt.settings.numberFormat);
  const variant = typeof params.variant === 'string' ? params.variant : 'current';
  const ctx = await getServiceContext();
  const [{ page, error: queryError }, accounts, groups, payees, tags] = await Promise.all([
    loadPage(search.query),
    listAccounts(ctx),
    listCategoryGroups(ctx),
    listPayees(ctx),
    listTags(ctx),
  ]);
  const error = search.error ?? queryError;

  const switcher =
    process.env.NODE_ENV === 'production' ? null : (
      <Suspense>
        <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} current={variant} />
      </Suspense>
    );
  const variantProps = {
    fmt,
    values: search.values,
    page,
    error,
    lists: { accounts, groups, payees, tags },
    variant,
    selected: typeof params.selected === 'string' ? params.selected : '',
  };
  if (process.env.NODE_ENV !== 'production' && variant !== 'current') {
    const Variant = { A: VariantA, B: VariantB, C: VariantC }[variant] ?? VariantA;
    return (
      <>
        <Variant {...variantProps} />
        {switcher}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Transactions</h1>

      <SearchForm values={search.values} lists={{ accounts, groups, payees, tags }} />

      <p className="text-sm">
        {/* A plain link: the route streams a file download, there is nothing to prefetch. */}
        <a href={transactionsExportHref(search.values)} download className="underline">
          Export CSV
        </a>{' '}
        <span className="text-zinc-500">(every Transaction matching the filters, for Excel)</span>
      </p>

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
                    <th className={CELL}>Payee</th>
                    <th className={CELL}>Category</th>
                    <th className={CELL}>Tags</th>
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
                      <td className={CELL}>{transaction.payee?.name ?? '—'}</td>
                      <td className={CELL}>
                        {transaction.transferId ? (
                          <span className="text-sky-700 dark:text-sky-400">Transfer</span>
                        ) : transaction.category ? (
                          <>
                            {transaction.category.name}
                            <div className="text-xs text-zinc-500">
                              {transaction.category.groupName}
                            </div>
                          </>
                        ) : (
                          <span className="text-zinc-500">Unclassified</span>
                        )}
                      </td>
                      <td className={CELL}>
                        {transaction.tags.map((tag) => tag.name).join(', ') || '—'}
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
      {switcher}
    </section>
  );
}

interface SearchFormProps {
  values: SearchValues;
  lists: { accounts: Account[]; groups: CategoryGroup[]; payees: Payee[]; tags: Tag[] };
}

function SearchForm({ values, lists }: SearchFormProps) {
  const { accounts, groups, payees, tags } = lists;
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
      <label className="flex flex-col gap-1 text-sm font-medium">
        Payee
        <select name="payeeId" defaultValue={values.payeeId} className={INPUT}>
          <option value="">All</option>
          {payees.map((payee) => (
            <option key={payee.id} value={payee.id}>
              {payee.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Category
        <select name="categoryId" defaultValue={values.categoryId} className={INPUT}>
          <option value="">All</option>
          {groups.map((group) => (
            <optgroup key={group.id} label={group.name}>
              {group.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Group type
        <select name="groupType" defaultValue={values.groupType} className={INPUT}>
          <option value="">All</option>
          {CATEGORY_GROUP_TYPES.map((type) => (
            <option key={type} value={type}>
              {CATEGORY_GROUP_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tag
        <select name="tagId" defaultValue={values.tagId} className={INPUT}>
          <option value="">All</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Transfers
        <select name="transfer" defaultValue={values.transfer} className={INPUT}>
          <option value="">Included</option>
          <option value="only">Only Transfers</option>
          <option value="exclude">Excluded</option>
        </select>
      </label>
      <label className="flex items-center gap-2 self-center text-sm font-medium">
        <input
          type="checkbox"
          name="unclassified"
          value="true"
          defaultChecked={values.unclassified === 'true'}
        />
        Unclassified only
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
