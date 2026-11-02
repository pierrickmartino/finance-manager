// PROTOTYPE variant C: spreadsheet. Full width, every field a column, the filters live in the
// header row under their own column. Dense, no side pane: a row opens the Transaction.

import Link from 'next/link';
import { FieldError } from '@/components/form';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import { transactionsExportHref } from '../search';
import { amountClass, CategoryLabel, transactionName } from '../transaction-display';
import { hrefFor, Pager, totalsByCurrency, type VariantProps } from './shared';

export const VARIANT_C_NAME = 'Spreadsheet';

const TH = 'px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-zinc-500 uppercase';
const FILTER =
  'w-full rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs font-normal dark:border-zinc-700 dark:bg-zinc-900';
const TOOLBAR_SELECT =
  'rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900';
const TD = 'px-2 py-1 align-middle';

export function VariantC({ fmt, values, lists, page, error, variant }: VariantProps) {
  const rows = page?.transactions ?? [];
  return (
    <section className="flex flex-col gap-2">
      <form method="get" action="/transactions" id="sheet-filters" />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <h1 className="mr-2 text-xl font-semibold">Transactions</h1>
        <input type="hidden" form="sheet-filters" name="variant" value={variant} />
        <select
          form="sheet-filters"
          name="status"
          defaultValue={values.status}
          className={TOOLBAR_SELECT}
        >
          <option value="">Imported + Manual</option>
          <option value="imported">Imported</option>
          <option value="manual">Manual</option>
        </select>
        <select
          form="sheet-filters"
          name="transfer"
          defaultValue={values.transfer}
          className={TOOLBAR_SELECT}
        >
          <option value="">Transfers included</option>
          <option value="only">Only Transfers</option>
          <option value="exclude">No Transfers</option>
        </select>
        <select
          form="sheet-filters"
          name="groupType"
          defaultValue={values.groupType}
          className={TOOLBAR_SELECT}
        >
          <option value="">Any group type</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="capital">Capital</option>
        </select>
        <label className="flex items-center gap-1 text-xs">
          <input
            form="sheet-filters"
            type="checkbox"
            name="unclassified"
            value="true"
            defaultChecked={values.unclassified === 'true'}
          />
          Unclassified only
        </label>
        <button
          form="sheet-filters"
          type="submit"
          className={`${PRIMARY_BUTTON_CLASS} py-1 text-xs`}
        >
          Apply filters ⏎
        </button>
        <span className="ml-auto flex gap-3 text-xs">
          <a href={hrefFor(variant, {} as typeof values)} className="underline">
            Clear
          </a>
          <a href={transactionsExportHref(values)} download className="underline">
            Export CSV
          </a>
        </span>
      </div>
      {error && <FieldError message={error} />}

      <div className={`${CARD_CLASS} max-h-[calc(100vh-11rem)] overflow-auto`}>
        <table className="w-full min-w-[64rem] border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th className={`${TH} w-28`}>Date</th>
              <th className={TH}>Name</th>
              <th className={TH}>Description / reference</th>
              <th className={`${TH} w-40`}>Category</th>
              <th className={`${TH} w-36`}>Account</th>
              <th className={`${TH} w-28`}>Tags</th>
              <th className={`${TH} w-32 text-right`}>Amount</th>
            </tr>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th className="px-2 pb-1.5">
                <input
                  form="sheet-filters"
                  type="date"
                  name="from"
                  defaultValue={values.from}
                  className={FILTER}
                />
                <input
                  form="sheet-filters"
                  type="date"
                  name="to"
                  defaultValue={values.to}
                  className={`${FILTER} mt-1`}
                />
              </th>
              <th className="px-2 pb-1.5 align-top">
                <select
                  form="sheet-filters"
                  name="payeeId"
                  defaultValue={values.payeeId}
                  className={FILTER}
                >
                  <option value="">Any Payee</option>
                  {lists.payees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-2 pb-1.5 align-top">
                <input
                  form="sheet-filters"
                  name="text"
                  defaultValue={values.text}
                  placeholder="contains…"
                  className={FILTER}
                />
              </th>
              <th className="px-2 pb-1.5 align-top">
                <select
                  form="sheet-filters"
                  name="categoryId"
                  defaultValue={values.categoryId}
                  className={FILTER}
                >
                  <option value="">Any</option>
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
              </th>
              <th className="px-2 pb-1.5 align-top">
                <select
                  form="sheet-filters"
                  name="accountId"
                  defaultValue={values.accountId}
                  className={FILTER}
                >
                  <option value="">Any</option>
                  {lists.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-2 pb-1.5 align-top">
                <select
                  form="sheet-filters"
                  name="tagId"
                  defaultValue={values.tagId}
                  className={FILTER}
                >
                  <option value="">Any</option>
                  {lists.tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-2 pb-1.5">
                <input
                  form="sheet-filters"
                  name="amountMin"
                  defaultValue={values.amountMin}
                  placeholder="≥ min"
                  className={`${FILTER} text-right`}
                />
                <input
                  form="sheet-filters"
                  name="amountMax"
                  defaultValue={values.amountMax}
                  placeholder="≤ max"
                  className={`${FILTER} mt-1 text-right`}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-zinc-500">
                  No Transactions match.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr
                key={t.id}
                className="border-b border-zinc-100 odd:bg-white even:bg-zinc-50/70 hover:bg-sky-50 dark:border-zinc-800 dark:odd:bg-zinc-900 dark:even:bg-zinc-900/60 dark:hover:bg-sky-950/40"
              >
                <td className={`${TD} whitespace-nowrap text-zinc-500 tabular-nums`}>
                  {fmt.date(t.bookingDate)}
                </td>
                <td className={`${TD} max-w-48 truncate font-medium`}>
                  <Link href={`/transactions/${t.id}`} className="hover:underline">
                    {transactionName(t)}
                  </Link>
                  {t.isManual && (
                    <span className="ml-1 rounded bg-zinc-200 px-1 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      M
                    </span>
                  )}
                </td>
                <td
                  className={`${TD} max-w-0 truncate font-mono text-[11px] text-zinc-500`}
                  title={t.rawDescription}
                >
                  {t.paymentReference ? `${t.paymentReference} · ` : ''}
                  {t.rawDescription}
                </td>
                <td className={`${TD} truncate`}>
                  <CategoryLabel transaction={t} />
                </td>
                <td className={`${TD} truncate text-zinc-600 dark:text-zinc-400`}>
                  {t.accountName}
                </td>
                <td className={`${TD} truncate text-zinc-500`}>
                  {t.tags.map((g) => `#${g.name}`).join(' ')}
                </td>
                <td
                  className={`${TD} text-right font-medium whitespace-nowrap tabular-nums ${amountClass(t.amountMinor)}`}
                >
                  {fmt.amount(t.amountMinor, { currency: t.currency })}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-zinc-100 font-semibold dark:bg-zinc-800">
              <tr>
                <td colSpan={6} className={`${TD} text-zinc-500`}>
                  {page?.total} matching · sum of this page
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {totalsByCurrency(rows).map((c) => (
                    <div key={c.currency}>{fmt.amount(c.net, { currency: c.currency })}</div>
                  ))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {page && <Pager variant={variant} values={values} page={page} />}
    </section>
  );
}
