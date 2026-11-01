/**
 * PROTOTYPE — Variant B "Feed": search-first, quick-filter pills, no table. Transactions read
 * like a bank app: grouped by day with the day's net, payee first, amount on the right.
 */
import Link from 'next/link';
import { FieldError } from '@/components/form';
import {
  activeFilters,
  amountTone,
  CategoryLabel,
  displayName,
  exportHref,
  FilterFields,
  groupBy,
  hrefWith,
  Pager,
  sumByCurrency,
  VariantInput,
  type VariantProps,
} from './shared';

export const NAME = 'Feed';

function quickFilters(props: VariantProps) {
  const clear = { unclassified: '', transfer: '', amountMin: '', amountMax: '' };
  const { values } = props;
  return [
    {
      label: 'All',
      href: hrefWith(props, 1, {}, clear),
      active: !values.unclassified && !values.transfer && !values.amountMin && !values.amountMax,
    },
    {
      label: 'Needs a category',
      href: hrefWith(props, 1, {}, { ...clear, unclassified: 'true' }),
      active: values.unclassified === 'true',
    },
    {
      label: 'Expenses',
      href: hrefWith(props, 1, {}, { ...clear, amountMax: '-0.01', transfer: 'exclude' }),
      active: values.amountMax === '-0.01',
    },
    {
      label: 'Income',
      href: hrefWith(props, 1, {}, { ...clear, amountMin: '0.01', transfer: 'exclude' }),
      active: values.amountMin === '0.01',
    },
    {
      label: 'Transfers',
      href: hrefWith(props, 1, {}, { ...clear, transfer: 'only' }),
      active: values.transfer === 'only',
    },
  ];
}

export function VariantB(props: VariantProps) {
  const { fmt, values, page, error, variant } = props;
  const rows = page?.transactions ?? [];
  const advanced = activeFilters(props).length;

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <form
        key={JSON.stringify(values)}
        method="get"
        action="/transactions"
        aria-label="Search Transactions"
        className="flex flex-col gap-3"
      >
        <VariantInput variant={variant} />
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-zinc-400">
            ⌕
          </span>
          <input
            name="text"
            defaultValue={values.text}
            placeholder="Search Transactions"
            className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pr-4 pl-10 text-base shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quickFilters(props).map((pill) => (
            <Link
              key={pill.label}
              href={pill.href}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                pill.active
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {pill.label}
            </Link>
          ))}
          <details className="relative ml-auto">
            <summary className="cursor-pointer list-none rounded-full border border-zinc-200 px-3 py-1 text-sm font-medium select-none dark:border-zinc-700">
              More filters{advanced > 0 && ` · ${advanced}`}
            </summary>
            <div className="absolute right-0 z-20 mt-2 grid w-80 grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
              <FilterFields values={values} lists={props.lists} />
              <button
                type="submit"
                className="col-span-2 rounded-md bg-zinc-900 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
              >
                Apply
              </button>
              <Link
                href={`/transactions?variant=${variant}`}
                className="col-span-2 text-center text-xs underline"
              >
                Reset everything
              </Link>
            </div>
          </details>
        </div>
      </form>

      {error && <FieldError message={error} />}

      {page && (
        <p className="flex justify-between text-sm text-zinc-500">
          <span>
            {page.total} Transaction{page.total === 1 ? '' : 's'}
          </span>
          <a href={exportHref(values)} download className="hover:underline">
            Export CSV
          </a>
        </p>
      )}

      {page && rows.length === 0 && (
        <p className="py-12 text-center text-zinc-500">Nothing here. Try another search.</p>
      )}

      {groupBy(rows, (r) => r.bookingDate).map(([day, dayRows]) => (
        <div key={day} className="flex flex-col">
          <div className="sticky top-0 z-10 flex justify-between bg-zinc-50/90 py-1.5 text-xs font-semibold text-zinc-500 uppercase backdrop-blur dark:bg-zinc-950/90">
            <span>{fmt.date(day)}</span>
            <span className="tabular-nums">
              {sumByCurrency(dayRows)
                .map(([c, v]) => fmt.amount(v, { currency: c }))
                .join(' · ')}
            </span>
          </div>
          <ul className="flex flex-col">
            {dayRows.map((t) => {
              const name = displayName(t);
              return (
                <li key={t.id}>
                  <Link
                    href={`/transactions/${t.id}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                        t.transferId
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                          : t.category
                            ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {t.transferId ? '⇄' : name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{name}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        <CategoryLabel transaction={t} /> · {t.accountName}
                        {t.tags.length > 0 && ` · ${t.tags.map((tag) => `#${tag.name}`).join(' ')}`}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${amountTone(t.amountMinor)}`}
                    >
                      {t.amountMinor > 0 && '+'}
                      {fmt.amount(t.amountMinor, { currency: t.currency })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Pager {...props} />
    </section>
  );
}
