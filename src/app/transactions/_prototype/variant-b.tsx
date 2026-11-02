// PROTOTYPE variant B: day ledger. Search bar + quick chips on top, filters folded away,
// Transactions grouped by booking day with a day net, rows expand in place (no side pane).

import Link from 'next/link';
import { FieldError } from '@/components/form';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { TransactionListItem } from '@/server/services/transactions';
import { transactionsExportHref, type SearchValues } from '../search';
import { amountClass, CategoryLabel, transactionName } from '../transaction-display';
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

export const VARIANT_B_NAME = 'Day ledger';

const BLANK: Partial<SearchValues> = { unclassified: '', transfer: '', groupType: '' };

const CHIPS: { label: string; set: Partial<SearchValues> }[] = [
  { label: 'All', set: {} },
  { label: 'Unclassified', set: { unclassified: 'true' } },
  { label: 'Income', set: { groupType: 'income' } },
  { label: 'Expenses', set: { groupType: 'expense' } },
  { label: 'Transfers', set: { transfer: 'only' } },
];

function isChipActive(values: SearchValues, set: Partial<SearchValues>): boolean {
  const merged = { ...values, ...BLANK, ...set };
  return (['unclassified', 'transfer', 'groupType'] as const).every((k) => values[k] === merged[k]);
}

export function VariantB({ fmt, values, lists, page, error, variant }: VariantProps) {
  const filters = activeFilterCount(values);
  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-4">
      <form method="get" action="/transactions" className="flex flex-col gap-3">
        <VariantField variant={variant} />
        <div className="flex items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <a href={transactionsExportHref(values)} download className="text-sm underline">
            Export CSV
          </a>
        </div>
        <div className="flex gap-2">
          <input
            name="text"
            defaultValue={values.text}
            placeholder="Search description, name, reference…"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-base shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button type="submit" className={`${PRIMARY_BUTTON_CLASS} px-5`}>
            Search
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((chip) => {
            const active = isChipActive(values, chip.set);
            return (
              <a
                key={chip.label}
                href={hrefFor(variant, values, 1, '', { ...BLANK, ...chip.set })}
                className={`rounded-full border px-3 py-1 text-sm ${
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                    : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
                }`}
              >
                {chip.label}
              </a>
            );
          })}
          <details className="group relative ml-auto">
            <summary className="cursor-pointer list-none rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700">
              More filters{filters > 0 && ` · ${filters}`} ▾
            </summary>
            <div
              className={`${CARD_CLASS} absolute right-0 z-20 mt-2 grid w-[32rem] max-w-[90vw] grid-cols-2 gap-3 p-4`}
            >
              <FilterInputs values={values} lists={lists} omit={['groupType', 'transfer']} />
              <input type="hidden" name="groupType" value={values.groupType} />
              <input type="hidden" name="transfer" value={values.transfer} />
              <input type="hidden" name="unclassified" value={values.unclassified} />
              <div className="col-span-2 flex justify-between">
                <a href={hrefFor(variant, {} as SearchValues)} className="text-sm underline">
                  Clear all
                </a>
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  Apply
                </button>
              </div>
            </div>
          </details>
        </div>
      </form>

      {error && <FieldError message={error} />}
      {page && page.transactions.length === 0 && (
        <p className="py-12 text-center text-zinc-500">No Transactions match.</p>
      )}
      {page && page.transactions.length > 0 && (
        <>
          <Totals fmt={fmt} transactions={page.transactions} total={page.total} />
          <div className="flex flex-col gap-5">
            {groupBy(page.transactions, (t) => t.bookingDate).map(([day, rows]) => (
              <Day key={day} fmt={fmt} day={day} rows={rows} />
            ))}
          </div>
          <Pager variant={variant} values={values} page={page} />
        </>
      )}
    </section>
  );
}

function Totals({
  fmt,
  transactions,
  total,
}: {
  fmt: VariantProps['fmt'];
  transactions: TransactionListItem[];
  total: number;
}) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-1 border-y border-zinc-200 py-3 text-sm dark:border-zinc-800">
      <span className="text-zinc-500">
        {total} Transaction{total === 1 ? '' : 's'} · this page:
      </span>
      {totalsByCurrency(transactions).map((t) => (
        <span key={t.currency} className="flex gap-4 tabular-nums">
          <span className="text-emerald-700 dark:text-emerald-400">
            In {fmt.amount(t.income, { currency: t.currency })}
          </span>
          <span>Out {fmt.amount(t.expense, { currency: t.currency })}</span>
          <span className="font-semibold">Net {fmt.amount(t.net, { currency: t.currency })}</span>
        </span>
      ))}
    </div>
  );
}

function Day({
  fmt,
  day,
  rows,
}: {
  fmt: VariantProps['fmt'];
  day: string;
  rows: TransactionListItem[];
}) {
  const weekday = new Date(`${day}T12:00:00`).toLocaleDateString('en', { weekday: 'long' });
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-baseline justify-between bg-zinc-50/90 py-1.5 backdrop-blur dark:bg-zinc-950/90">
        <h2 className="text-sm font-semibold">
          {weekday} <span className="font-normal text-zinc-500">{fmt.date(day)}</span>
        </h2>
        <span className="text-xs text-zinc-500 tabular-nums">
          {totalsByCurrency(rows)
            .map((t) => fmt.amount(t.net, { currency: t.currency }))
            .join(' · ')}
        </span>
      </div>
      <ul className={`${CARD_CLASS} divide-y divide-zinc-100 dark:divide-zinc-800`}>
        {rows.map((t) => (
          <Row key={t.id} fmt={fmt} t={t} />
        ))}
      </ul>
    </div>
  );
}

function Row({ fmt, t }: { fmt: VariantProps['fmt']; t: TransactionListItem }) {
  const name = transactionName(t);
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{name}</span>
            <span className="block truncate text-xs text-zinc-500">
              <CategoryLabel transaction={t} /> · {t.accountName}
              {t.tags.map((tag) => ` #${tag.name}`)}
            </span>
          </span>
          <span className={`font-semibold tabular-nums ${amountClass(t.amountMinor)}`}>
            {fmt.amount(t.amountMinor, { currency: t.currency })}
          </span>
          <span className="text-zinc-400 transition group-open:rotate-90">›</span>
        </summary>
        <div className="grid gap-3 bg-zinc-50 px-4 py-3 pl-16 text-sm sm:grid-cols-[1fr_auto] dark:bg-zinc-950/50">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
            <dt className="text-zinc-500">Counterparty</dt>
            <dd>{t.counterpartyName ?? '—'}</dd>
            <dt className="text-zinc-500">IBAN</dt>
            <dd className="font-mono text-xs">{t.counterpartyIban ?? '—'}</dd>
            <dt className="text-zinc-500">Reference</dt>
            <dd>{t.paymentReference ?? '—'}</dd>
            <dt className="text-zinc-500">Description</dt>
            <dd className="font-mono text-xs break-words text-zinc-600 dark:text-zinc-400">
              {t.rawDescription || '(no description)'}
            </dd>
            {t.notes && (
              <>
                <dt className="text-zinc-500">Notes</dt>
                <dd className="whitespace-pre-line">{t.notes}</dd>
              </>
            )}
          </dl>
          <Link href={`/transactions/${t.id}`} className={`${PRIMARY_BUTTON_CLASS} h-fit self-end`}>
            Open & classify
          </Link>
        </div>
      </details>
    </li>
  );
}
