/**
 * PROTOTYPE — throwaway. Three variants of the Transactions page, switchable via `?variant=`,
 * on the existing `/transactions` route. The question: what should this page look like?
 * Delete this folder (and the switch in ../page.tsx) once a variant wins.
 */
import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { Account } from '@/server/services/accounts';
import type { CategoryGroup } from '@/server/services/categories';
import type { Payee } from '@/server/services/payees';
import type { Tag } from '@/server/services/tags';
import type { TransactionListItem, TransactionPage } from '@/server/services/transactions';
import { transactionsExportHref, transactionsHref, type SearchValues } from '../search';

export interface VariantProps {
  fmt: Formatter;
  values: SearchValues;
  page: TransactionPage | null;
  error: string | null;
  lists: { accounts: Account[]; groups: CategoryGroup[]; payees: Payee[]; tags: Tag[] };
  variant: string;
  /** Raw `?selected=` (variant C's preview pane). */
  selected: string;
}

export const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';

/** The list URL, keeping the prototype's `variant` (and optional extras) in the query. */
export function hrefWith(
  props: Pick<VariantProps, 'values' | 'variant'>,
  page = 1,
  extra: Record<string, string> = {},
  overrides: Partial<SearchValues> = {},
): string {
  const base = transactionsHref({ ...props.values, ...overrides }, page);
  const url = new URL(base, 'http://x');
  url.searchParams.set('variant', props.variant);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export function exportHref(values: SearchValues): string {
  return transactionsExportHref(values);
}

export function VariantInput({ variant }: { variant: string }) {
  return <input type="hidden" name="variant" value={variant} />;
}

/** Every filter input except free text, laid out by the caller's container. */
export function FilterFields({ values, lists }: Pick<VariantProps, 'values' | 'lists'>) {
  const label = 'flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400';
  const select = (name: keyof SearchValues, options: [string, string][], all = 'All') => (
    <select name={name} defaultValue={values[name]} className={INPUT}>
      <option value="">{all}</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <label className={label}>
        From
        <input type="date" name="from" defaultValue={values.from} className={INPUT} />
      </label>
      <label className={label}>
        To
        <input type="date" name="to" defaultValue={values.to} className={INPUT} />
      </label>
      <label className={label}>
        Account
        {select(
          'accountId',
          lists.accounts.map((a) => [a.id, a.name]),
        )}
      </label>
      <label className={label}>
        Payee
        {select(
          'payeeId',
          lists.payees.map((p) => [p.id, p.name]),
        )}
      </label>
      <label className={label}>
        Category
        <select name="categoryId" defaultValue={values.categoryId} className={INPUT}>
          <option value="">All</option>
          {lists.groups.map((group) => (
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
      <label className={label}>
        Tag
        {select(
          'tagId',
          lists.tags.map((t) => [t.id, t.name]),
        )}
      </label>
      <label className={label}>
        Amount from
        <input name="amountMin" defaultValue={values.amountMin} className={INPUT} />
      </label>
      <label className={label}>
        Amount to
        <input name="amountMax" defaultValue={values.amountMax} className={INPUT} />
      </label>
      <label className={label}>
        Status
        {select('status', [
          ['imported', 'Imported'],
          ['manual', 'Manual'],
        ])}
      </label>
      <label className={label}>
        Transfers
        {select(
          'transfer',
          [
            ['only', 'Only Transfers'],
            ['exclude', 'Excluded'],
          ],
          'Included',
        )}
      </label>
      <input type="hidden" name="groupType" value={values.groupType} />
      <label className="flex items-center gap-2 self-end py-1.5 text-sm">
        <input
          type="checkbox"
          name="unclassified"
          value="true"
          defaultChecked={values.unclassified === 'true'}
        />
        Unclassified only
      </label>
    </>
  );
}

export function amountTone(minor: number): string {
  return minor < 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-emerald-700 dark:text-emerald-400';
}

/** "Groceries", "Transfer" or "Unclassified" with a colour hint. */
export function CategoryLabel({ transaction }: { transaction: TransactionListItem }) {
  if (transaction.transferId)
    return <span className="text-sky-700 dark:text-sky-400">Transfer</span>;
  if (transaction.category) return <>{transaction.category.name}</>;
  return <span className="text-amber-700 dark:text-amber-400">Unclassified</span>;
}

export function displayName(transaction: TransactionListItem): string {
  return (
    transaction.payee?.name ??
    transaction.counterpartyName ??
    (transaction.rawDescription || '(no description)')
  );
}

/** Totals per currency, so a mixed CHF / EUR page never adds the two together. */
export function sumByCurrency(rows: TransactionListItem[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const row of rows)
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amountMinor);
  return [...totals.entries()];
}

export function groupBy<T>(rows: T[], key: (row: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return [...groups.entries()];
}

export function Pager(props: VariantProps) {
  const { page } = props;
  if (!page || page.pageCount <= 1) return null;
  const linkClass = 'rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800';
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-4 text-sm">
      <span className="text-zinc-500">
        Page {page.page} of {page.pageCount}
      </span>
      <span className="flex gap-1">
        {page.page > 1 && (
          <Link href={hrefWith(props, page.page - 1)} className={linkClass}>
            ← Previous
          </Link>
        )}
        {page.page < page.pageCount && (
          <Link href={hrefWith(props, page.page + 1)} className={linkClass}>
            Next →
          </Link>
        )}
      </span>
    </nav>
  );
}

/** Human labels for the active filters, each with a link that drops just that filter. */
export function activeFilters(props: VariantProps): { label: string; href: string }[] {
  const { values, lists } = props;
  const nameOf = (list: { id: string; name: string }[], id: string) =>
    list.find((item) => item.id === id)?.name ?? id;
  const categories = lists.groups.flatMap((group) => group.categories);
  const labels: Partial<Record<keyof SearchValues, string>> = {
    text: values.text && `“${values.text}”`,
    from: values.from && `From ${props.fmt.date(values.from)}`,
    to: values.to && `To ${props.fmt.date(values.to)}`,
    accountId: values.accountId && nameOf(lists.accounts, values.accountId),
    amountMin: values.amountMin && `≥ ${values.amountMin}`,
    amountMax: values.amountMax && `≤ ${values.amountMax}`,
    status: values.status && (values.status === 'manual' ? 'Manual' : 'Imported'),
    payeeId: values.payeeId && `Payee: ${nameOf(lists.payees, values.payeeId)}`,
    categoryId: values.categoryId && nameOf(categories, values.categoryId),
    groupType: values.groupType && `Type: ${values.groupType}`,
    tagId: values.tagId && `#${nameOf(lists.tags, values.tagId)}`,
    unclassified: values.unclassified && 'Unclassified',
    transfer: values.transfer && (values.transfer === 'only' ? 'Transfers only' : 'No Transfers'),
  };
  return Object.entries(labels)
    .filter(([, label]) => label)
    .map(([field, label]) => ({
      label: label as string,
      href: hrefWith(props, 1, {}, { [field]: '' }),
    }));
}
