// PROTOTYPE: shared props and URL helpers for the Transactions page variants. Throwaway.

import type { Formatter } from '@/lib/format';
import type { TransactionListItem, TransactionPage } from '@/server/services/transactions';
import type { FilterLists } from '../filter-rail';
import { transactionsHref, type SearchValues } from '../search';

export interface VariantProps {
  fmt: Formatter;
  values: SearchValues;
  lists: FilterLists;
  page: TransactionPage | null;
  error: string | null;
  selected: TransactionListItem | null;
  variant: string;
}

/** `transactionsHref`, keeping `?variant=` so links stay on the same variant. */
export function hrefFor(
  variant: string,
  values: SearchValues,
  page = 1,
  selected = '',
  overrides: Partial<SearchValues> = {},
): string {
  const href = transactionsHref({ ...values, ...overrides }, page, selected);
  return `${href}${href.includes('?') ? '&' : '?'}variant=${variant}`;
}

/** Hidden field so GET forms stay on the same variant. */
export function VariantField({ variant }: { variant: string }) {
  return <input type="hidden" name="variant" value={variant} />;
}

/** Per-Currency totals of a set of Transactions: income, expenses, net. */
export function totalsByCurrency(
  transactions: TransactionListItem[],
): { currency: string; income: number; expense: number; net: number }[] {
  const byCurrency = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    const prev = byCurrency.get(t.currency) ?? { income: 0, expense: 0 };
    byCurrency.set(t.currency, {
      income: prev.income + Math.max(0, t.amountMinor),
      expense: prev.expense + Math.min(0, t.amountMinor),
    });
  }
  return [...byCurrency.entries()].map(([currency, { income, expense }]) => ({
    currency,
    income,
    expense,
    net: income + expense,
  }));
}

/** Rows grouped by a key, keeping first-seen order. */
export function groupBy<T>(rows: T[], key: (row: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return [...groups.entries()];
}

export function Pager({
  variant,
  values,
  page,
}: {
  variant: string;
  values: SearchValues;
  page: TransactionPage;
}) {
  if (page.pageCount <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-center gap-4 py-2 text-sm">
      {page.page > 1 ? (
        <a href={hrefFor(variant, values, page.page - 1)} className="underline">
          ← Previous
        </a>
      ) : (
        <span className="text-zinc-400">← Previous</span>
      )}
      <span className="text-zinc-500">
        Page {page.page} of {page.pageCount}
      </span>
      {page.page < page.pageCount ? (
        <a href={hrefFor(variant, values, page.page + 1)} className="underline">
          Next →
        </a>
      ) : (
        <span className="text-zinc-400">Next →</span>
      )}
    </nav>
  );
}

const INPUT =
  'w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400';

type FilterName = Exclude<keyof SearchValues, 'text' | 'unclassified'>;

/** The filter inputs (no form, no layout): each variant arranges them its own way. */
export function FilterInputs({
  values,
  lists,
  omit = [],
}: {
  values: SearchValues;
  lists: FilterLists;
  omit?: FilterName[];
}) {
  const show = (name: FilterName) => !omit.includes(name);
  return (
    <>
      {show('from') && <Field label="From" name="from" type="date" value={values.from} />}
      {show('to') && <Field label="To" name="to" type="date" value={values.to} />}
      {show('accountId') && (
        <Choice
          label="Account"
          name="accountId"
          value={values.accountId}
          options={lists.accounts.map((a) => [a.id, a.name])}
        />
      )}
      {show('payeeId') && (
        <Choice
          label="Payee"
          name="payeeId"
          value={values.payeeId}
          options={lists.payees.map((p) => [p.id, p.name])}
        />
      )}
      {show('categoryId') && (
        <label className={LABEL}>
          Category
          <select name="categoryId" defaultValue={values.categoryId} className={INPUT}>
            <option value="">All</option>
            {lists.groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {show('groupType') && (
        <Choice
          label="Group type"
          name="groupType"
          value={values.groupType}
          options={[
            ['income', 'Income'],
            ['expense', 'Expense'],
            ['capital', 'Capital'],
          ]}
        />
      )}
      {show('tagId') && (
        <Choice
          label="Tag"
          name="tagId"
          value={values.tagId}
          options={lists.tags.map((t) => [t.id, t.name])}
        />
      )}
      {show('status') && (
        <Choice
          label="Status"
          name="status"
          value={values.status}
          options={[
            ['imported', 'Imported'],
            ['manual', 'Manual'],
          ]}
        />
      )}
      {show('amountMin') && <Field label="Amount from" name="amountMin" value={values.amountMin} />}
      {show('amountMax') && <Field label="Amount to" name="amountMax" value={values.amountMax} />}
      {show('transfer') && (
        <Choice
          label="Transfers"
          name="transfer"
          value={values.transfer}
          allLabel="Included"
          options={[
            ['only', 'Only Transfers'],
            ['exclude', 'Excluded'],
          ]}
        />
      )}
    </>
  );
}

function Field({
  label,
  name,
  value,
  type = 'text',
}: {
  label: string;
  name: string;
  value: string;
  type?: string;
}) {
  return (
    <label className={LABEL}>
      {label}
      <input name={name} type={type} defaultValue={value} className={INPUT} />
    </label>
  );
}

function Choice({
  label,
  name,
  value,
  options,
  allLabel = 'All',
}: {
  label: string;
  name: string;
  value: string;
  options: (readonly [string, string])[];
  allLabel?: string;
}) {
  return (
    <label className={LABEL}>
      {label}
      <select name={name} defaultValue={value} className={INPUT}>
        <option value="">{allLabel}</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** How many filters (other than the text search) are set. */
export function activeFilterCount(values: SearchValues): number {
  return Object.entries(values).filter(([k, v]) => k !== 'text' && v).length;
}
