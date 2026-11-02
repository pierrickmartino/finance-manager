// PROTOTYPE variant D: by Category. The page is organised around classification, not time:
// a breakdown column (clickable, it filters), Unclassified surfaced first as a to-do, and the
// Transactions grouped under their Category. Filters live in a drawer.
// Breakdown sums cover the current page only (a real version would need a service aggregate).

import Link from 'next/link';
import { FieldError } from '@/components/form';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { TransactionListItem } from '@/server/services/transactions';
import { transactionsExportHref, type SearchValues } from '../search';
import { amountClass, categoryText, transactionName } from '../transaction-display';
import {
  activeFilterCount,
  FilterInputs,
  groupBy,
  hrefFor,
  Pager,
  totalsByCurrency,
  VariantField,
  type VariantProps,
} from './shared';

export const VARIANT_D_NAME = 'By Category';

type Fmt = VariantProps['fmt'];

/** Group key: Unclassified first, then Transfer, Split, then Categories by name. */
function bucket(t: TransactionListItem): string {
  const text = categoryText(t);
  return text.startsWith('Split') ? 'Split' : text;
}

function rank(name: string): number {
  if (name === 'Unclassified') return 0;
  if (name === 'Transfer') return 2;
  if (name === 'Split') return 3;
  return 1;
}

/** "CHF -120.00 · EUR -40.00": never adds amounts across Currencies. */
function sumText(fmt: Fmt, rows: TransactionListItem[]): string {
  return totalsByCurrency(rows)
    .map((t) => fmt.amount(t.net, { currency: t.currency }))
    .join(' · ');
}

/** Bar length and sort only: a rough magnitude, mixing Currencies 1:1 (prototype). */
function sum(rows: TransactionListItem[]): number {
  return rows.reduce((s, t) => s + t.amountMinor, 0);
}

export function VariantD({ fmt, values, lists, page, error, variant }: VariantProps) {
  const rows = page?.transactions ?? [];
  const groups = groupBy(rows, bucket).sort(
    ([a, ra], [b, rb]) => rank(a) - rank(b) || Math.abs(sum(rb)) - Math.abs(sum(ra)),
  );
  const largest = Math.max(1, ...groups.map(([, r]) => Math.abs(sum(r))));
  const unclassified = groups.find(([name]) => name === 'Unclassified')?.[1].length ?? 0;
  const categoryIdOf = (name: string) =>
    rows.find((t) => t.category?.name === name)?.category?.id ?? '';

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        {page && (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {page.total}
          </span>
        )}
        <form method="get" action="/transactions" className="ml-auto flex items-center gap-2">
          <VariantField variant={variant} />
          <input
            name="text"
            defaultValue={values.text}
            placeholder="Search…"
            className="w-56 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <Drawer values={values} lists={lists} variant={variant} />
        </form>
      </header>

      {unclassified > 0 && values.unclassified !== 'true' && (
        <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <span>
            <strong>{unclassified}</strong> Transaction{unclassified === 1 ? '' : 's'} on this page
            still need a Category.
          </span>
          <a
            href={hrefFor(variant, values, 1, '', { unclassified: 'true' })}
            className="font-medium text-amber-800 underline dark:text-amber-300"
          >
            Classify them →
          </a>
        </div>
      )}
      {error && <FieldError message={error} />}
      {page && rows.length === 0 && (
        <p className="py-12 text-center text-zinc-500">No Transactions match.</p>
      )}

      {rows.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className={`${CARD_CLASS} h-fit p-4 lg:sticky lg:top-4`}>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Breakdown · this page
            </h2>
            <ul className="flex flex-col gap-2.5">
              {groups.map(([name, r]) => {
                const total = sum(r);
                const id = categoryIdOf(name);
                const href =
                  name === 'Unclassified'
                    ? hrefFor(variant, values, 1, '', { unclassified: 'true' })
                    : name === 'Transfer'
                      ? hrefFor(variant, values, 1, '', { transfer: 'only' })
                      : id
                        ? hrefFor(variant, values, 1, '', { categoryId: id })
                        : `#cat-${name}`;
                return (
                  <li key={name}>
                    <a href={href} className="group block">
                      <span className="flex justify-between gap-2 text-sm">
                        <span className="truncate group-hover:underline">
                          {name} <span className="text-zinc-400">{r.length}</span>
                        </span>
                        <span className={`tabular-nums ${amountClass(total)}`}>
                          {sumText(fmt, r)}
                        </span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <span
                          className={`block h-1.5 rounded-full ${
                            name === 'Unclassified'
                              ? 'bg-amber-400'
                              : total > 0
                                ? 'bg-emerald-500'
                                : 'bg-zinc-400'
                          }`}
                          style={{ width: `${(Math.abs(total) / largest) * 100}%` }}
                        />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="flex flex-col gap-6">
            {groups.map(([name, r]) => (
              <Group key={name} fmt={fmt} name={name} rows={r} />
            ))}
            {page && <Pager variant={variant} values={values} page={page} />}
          </div>
        </div>
      )}
    </section>
  );
}

function Group({ fmt, name, rows }: { fmt: Fmt; name: string; rows: TransactionListItem[] }) {
  const isTodo = name === 'Unclassified';
  return (
    <div id={`cat-${name}`}>
      <h2 className="mb-2 flex items-baseline gap-2 text-lg font-semibold">
        {name}
        <span className="text-sm font-normal text-zinc-500">
          {rows.length} · {sumText(fmt, rows)}
        </span>
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {rows.map((t) => (
          <Link
            key={t.id}
            href={`/transactions/${t.id}`}
            className={`${CARD_CLASS} flex flex-col gap-1 p-3 hover:border-zinc-400 dark:hover:border-zinc-600 ${
              isTodo ? 'border-l-4 border-l-amber-400' : ''
            }`}
          >
            <span className="flex justify-between gap-2">
              <span className="truncate font-medium">{transactionName(t)}</span>
              <span
                className={`font-semibold whitespace-nowrap tabular-nums ${amountClass(t.amountMinor)}`}
              >
                {fmt.amount(t.amountMinor, { currency: t.currency })}
              </span>
            </span>
            <span className="truncate text-xs text-zinc-500">
              {fmt.date(t.bookingDate)} · {t.accountName}
              {t.tags.map((g) => ` #${g.name}`)}
            </span>
            {isTodo && (
              <span className="truncate font-mono text-[11px] text-zinc-400">
                {t.rawDescription}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Drawer({
  values,
  lists,
  variant,
}: {
  values: SearchValues;
  lists: VariantProps['lists'];
  variant: string;
}) {
  const count = activeFilterCount(values);
  return (
    <details className="group">
      {/* When open, the summary becomes the drawer's close button. */}
      <summary className="cursor-pointer list-none rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm group-open:fixed group-open:top-5 group-open:right-5 group-open:z-50 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="group-open:hidden">Filters{count > 0 && ` (${count})`}</span>
        <span className="hidden group-open:inline">Close ✕</span>
      </summary>
      <div className="fixed inset-y-0 right-0 z-40 flex w-96 max-w-[90vw] flex-col gap-3 overflow-y-auto border-l border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Filters</h2>
        <FilterInputs values={values} lists={lists} />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="unclassified"
            value="true"
            defaultChecked={values.unclassified === 'true'}
          />
          Unclassified only
        </label>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          Apply
        </button>
        <div className="flex justify-between text-sm">
          <a href={hrefFor(variant, {} as SearchValues)} className="underline">
            Clear
          </a>
          <a href={transactionsExportHref(values)} download className="underline">
            Export CSV
          </a>
        </div>
      </div>
    </details>
  );
}
