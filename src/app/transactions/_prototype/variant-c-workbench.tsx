/**
 * PROTOTYPE — Variant C "Workbench": master / detail. A permanent filter rail on the left, a
 * compact selectable list in the middle, and a preview pane on the right (`?selected=`), so
 * reviewing many Transactions never leaves the page.
 */
import Link from 'next/link';
import { FieldError } from '@/components/form';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { TransactionListItem } from '@/server/services/transactions';
import {
  amountTone,
  CategoryLabel,
  displayName,
  exportHref,
  FilterFields,
  hrefWith,
  INPUT,
  Pager,
  VariantInput,
  type VariantProps,
} from './shared';

export const NAME = 'Workbench';

export function VariantC(props: VariantProps) {
  const { fmt, values, page, error, variant } = props;
  const rows = page?.transactions ?? [];
  const selected = rows.find((r) => r.id === props.selected) ?? rows[0];

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Transactions</h1>
      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <form
          key={JSON.stringify(values)}
          method="get"
          action="/transactions"
          aria-label="Search Transactions"
          className={`${CARD_CLASS} flex h-fit flex-col gap-3 p-3 lg:sticky lg:top-4`}
        >
          <VariantInput variant={variant} />
          <input name="text" defaultValue={values.text} placeholder="Search…" className={INPUT} />
          <FilterFields values={values} lists={props.lists} />
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            Apply
          </button>
          <div className="flex justify-between text-xs">
            <Link href={`/transactions?variant=${variant}`} className="underline">
              Clear
            </Link>
            <a href={exportHref(values)} download className="underline">
              Export CSV
            </a>
          </div>
        </form>

        <div className="flex min-w-0 flex-col gap-2">
          {error && <FieldError message={error} />}
          {page && (
            <p className="text-sm text-zinc-500">
              {page.total} Transaction{page.total === 1 ? '' : 's'}
            </p>
          )}
          {page && rows.length === 0 && (
            <p className="text-sm text-zinc-500">No Transactions match.</p>
          )}
          {rows.length > 0 && (
            <ol
              aria-label="Transactions"
              className={`${CARD_CLASS} divide-y divide-zinc-100 dark:divide-zinc-800`}
            >
              {rows.map((t) => {
                const isSelected = t.id === selected?.id;
                return (
                  <li key={t.id}>
                    <Link
                      href={hrefWith(props, page?.page, { selected: t.id })}
                      scroll={false}
                      aria-current={isSelected ? 'true' : undefined}
                      className={`grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-3 px-3 py-2 text-sm ${
                        isSelected
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <span className="tabular-nums opacity-60">{fmt.date(t.bookingDate)}</span>
                      <span className="truncate">
                        <span className="font-medium">{displayName(t)}</span>
                        <span className="ml-2 text-xs opacity-70">
                          <CategoryLabel transaction={t} />
                        </span>
                      </span>
                      <span
                        className={`font-medium tabular-nums ${isSelected ? '' : amountTone(t.amountMinor)}`}
                      >
                        {fmt.amount(t.amountMinor, { currency: t.currency })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          <Pager {...props} />
        </div>

        {selected && <Preview transaction={selected} fmt={fmt} />}
      </div>
    </section>
  );
}

function Preview({
  transaction: t,
  fmt,
}: { transaction: TransactionListItem } & Pick<VariantProps, 'fmt'>) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right">{value || '—'}</dd>
    </div>
  );
  return (
    <aside
      aria-label="Selected Transaction"
      className={`${CARD_CLASS} flex h-fit flex-col gap-4 p-4 lg:sticky lg:top-4`}
    >
      <div>
        <p className="text-xs text-zinc-500">
          {fmt.date(t.bookingDate)} · {t.accountName}
        </p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${amountTone(t.amountMinor)}`}>
          {fmt.amount(t.amountMinor, { currency: t.currency })}
        </p>
        <p className="mt-1 font-medium">{displayName(t)}</p>
      </div>
      <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {row('Category', <CategoryLabel transaction={t} />)}
        {row('Payee', t.payee?.name)}
        {row('Tags', t.tags.map((tag) => tag.name).join(', '))}
        {row('Counterparty', t.counterpartyName)}
        {row(
          'IBAN',
          t.counterpartyIban && <span className="font-mono text-xs">{t.counterpartyIban}</span>,
        )}
        {row('Reference', t.paymentReference)}
        {row('Source', t.isManual ? 'Manual' : 'Imported')}
      </dl>
      <p className="rounded-md bg-zinc-50 p-2 font-mono text-xs break-words text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
        {t.rawDescription || '(no description)'}
      </p>
      {t.notes && <p className="text-sm italic">{t.notes}</p>}
      <Link href={`/transactions/${t.id}`} className={`${PRIMARY_BUTTON_CLASS} text-center`}>
        Open & classify
      </Link>
    </aside>
  );
}
