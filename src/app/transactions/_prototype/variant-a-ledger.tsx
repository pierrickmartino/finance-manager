/**
 * PROTOTYPE — Variant A "Ledger": one search box + collapsible filter panel, removable filter
 * chips, a totals strip, and a dense table grouped by month with per-month subtotals.
 */
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import {
  activeFilters,
  amountTone,
  CategoryLabel,
  exportHref,
  FilterFields,
  groupBy,
  INPUT,
  Pager,
  sumByCurrency,
  VariantInput,
  type VariantProps,
} from './shared';

export const NAME = 'Ledger';

export function VariantA(props: VariantProps) {
  const { fmt, values, page, error, variant } = props;
  const chips = activeFilters(props);
  const rows = page?.transactions ?? [];
  const inflow = sumByCurrency(rows.filter((r) => r.amountMinor > 0));
  const outflow = sumByCurrency(rows.filter((r) => r.amountMinor < 0));
  const unclassified = rows.filter((r) => !r.category && !r.transferId).length;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <a href={exportHref(values)} download className="text-sm font-medium hover:underline">
          ↓ Export CSV
        </a>
      </header>

      <form
        key={JSON.stringify(values)}
        method="get"
        action="/transactions"
        aria-label="Search Transactions"
        className={`${CARD_CLASS} flex flex-col gap-3 p-3`}
      >
        <VariantInput variant={variant} />
        <div className="flex gap-2">
          <input
            name="text"
            defaultValue={values.text}
            placeholder="Search description, name, reference…"
            className={`${INPUT} flex-1`}
          />
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            Search
          </button>
        </div>
        <details open={chips.length > 0 && !values.text} className="group">
          <summary className="cursor-pointer text-sm font-medium text-zinc-600 select-none dark:text-zinc-400">
            Filters{chips.length > 0 && ` (${chips.length})`}
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <FilterFields values={values} lists={props.lists} />
          </div>
        </details>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <Link
                key={chip.label}
                href={chip.href}
                className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium hover:bg-rose-100 hover:line-through dark:bg-zinc-800"
              >
                {chip.label} ×
              </Link>
            ))}
            <Link href={`/transactions?variant=${variant}`} className="text-xs underline">
              Clear all
            </Link>
          </div>
        )}
      </form>

      {error && <FieldError message={error} />}

      {page && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Matching" value={String(page.total)} />
          <Stat
            label="In (this page)"
            value={inflow.map(([c, v]) => fmt.amount(v, { currency: c })).join(' · ') || '—'}
            tone="text-emerald-700 dark:text-emerald-400"
          />
          <Stat
            label="Out (this page)"
            value={outflow.map(([c, v]) => fmt.amount(v, { currency: c })).join(' · ') || '—'}
          />
          <Stat
            label="Unclassified (this page)"
            value={String(unclassified)}
            tone={unclassified ? 'text-amber-700 dark:text-amber-400' : undefined}
          />
        </dl>
      )}

      {page && rows.length === 0 && <p className="text-sm text-zinc-500">No Transactions match.</p>}

      {rows.length > 0 && (
        <div className={`${CARD_CLASS} overflow-x-auto`}>
          <table aria-label="Transactions" className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500 uppercase dark:bg-zinc-950">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            {groupBy(rows, (r) => r.bookingDate.slice(0, 7)).map(([month, monthRows]) => (
              <tbody key={month} className="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr className="bg-zinc-50/70 dark:bg-zinc-900">
                  <th colSpan={4} className="px-3 py-1.5 text-left text-xs font-semibold">
                    {fmt.period(month)}
                  </th>
                  <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums">
                    {sumByCurrency(monthRows)
                      .map(([c, v]) => fmt.amount(v, { currency: c }))
                      .join(' · ')}
                  </td>
                </tr>
                {monthRows.map((t) => {
                  const isUnclassified = !t.category && !t.transferId;
                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${isUnclassified ? 'border-l-2 border-l-amber-400' : ''}`}
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500 tabular-nums">
                        {fmt.date(t.bookingDate)}
                      </td>
                      <td className="max-w-md truncate px-3 py-1.5">
                        <Link
                          href={`/transactions/${t.id}`}
                          className="font-medium hover:underline"
                        >
                          {t.payee?.name ?? (t.rawDescription || '(no description)')}
                        </Link>
                        {t.payee && (
                          <span className="ml-2 text-xs text-zinc-500">{t.rawDescription}</span>
                        )}
                        {t.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="ml-1.5 rounded bg-zinc-100 px-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            #{tag.name}
                          </span>
                        ))}
                        {t.isManual && <span className="ml-1.5 text-xs text-zinc-400">manual</span>}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <CategoryLabel transaction={t} />
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-zinc-500">
                        {t.accountName}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right font-medium whitespace-nowrap tabular-nums ${amountTone(t.amountMinor)}`}
                      >
                        {fmt.amount(t.amountMinor, { currency: t.currency })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <Pager {...props} />
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`${CARD_CLASS} px-3 py-2`}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}
