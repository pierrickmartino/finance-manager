import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Account } from '@/server/services/accounts';
import {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
  type CategoryGroup,
} from '@/server/services/categories';
import type { Payee } from '@/server/services/payees';
import {
  AXIS_LABELS,
  MEASURE_LABELS,
  MEASURES,
  REPORT_AXES,
  TIME_AXES,
  type WidgetQueryInput,
} from '@/server/services/reporting';
import type { Tag } from '@/server/services/tags';

const INPUT =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const MULTI = `${INPUT} min-w-40`;

const UNIT_LABELS = { month: 'Months', quarter: 'Quarters', year: 'Years' } as const;

export interface QueryFormLists {
  accounts: Account[];
  groups: CategoryGroup[];
  payees: Payee[];
  tags: Tag[];
}

interface QueryFormProps {
  query: WidgetQueryInput;
  lists: QueryFormLists;
  /** Extra hidden fields to keep (e.g. the Widget being edited). */
  hidden?: Record<string, string>;
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

/**
 * The Widget query definition as a GET form (spec 99–103): submitting it shows the report.
 * Fields that don't apply to the chosen date range are ignored.
 */
export function QueryForm({ query, lists, hidden = {} }: QueryFormProps) {
  const { accounts, groups, payees, tags } = lists;
  const range = query.dateRange;
  const filters = query.filters ?? {};
  const currencies = [...new Set(accounts.map((account) => account.currency))].sort();
  return (
    <form
      key={JSON.stringify(query)}
      method="get"
      aria-label="Widget query"
      className="flex flex-col gap-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="mb-2 text-sm font-semibold">Date range</legend>
        <Labelled label="Range">
          <select name="range" defaultValue={range.kind} className={INPUT}>
            <option value="last">Last complete periods</option>
            <option value="yearToDate">Year to date</option>
            <option value="fixed">Fixed dates</option>
          </select>
        </Labelled>
        <Labelled label="Number of periods">
          <input
            name="count"
            type="number"
            min={1}
            defaultValue={range.kind === 'last' ? range.count : 12}
            className={`${INPUT} w-24`}
          />
        </Labelled>
        <Labelled label="Period">
          <select
            name="unit"
            defaultValue={range.kind === 'last' ? range.unit : 'month'}
            className={INPUT}
          >
            {TIME_AXES.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </Labelled>
        <label className="flex items-center gap-2 self-center text-sm font-medium">
          <input
            type="checkbox"
            name="current"
            value="1"
            defaultChecked={range.kind !== 'fixed' && range.includeCurrent === true}
          />
          Include the current period (partial)
        </label>
        <Labelled label="From">
          <input
            name="from"
            type="date"
            defaultValue={range.kind === 'fixed' ? range.from : ''}
            className={INPUT}
          />
        </Labelled>
        <Labelled label="To">
          <input
            name="to"
            type="date"
            defaultValue={range.kind === 'fixed' ? range.to : ''}
            className={INPUT}
          />
        </Labelled>
      </fieldset>

      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="mb-2 text-sm font-semibold">Layout and measure</legend>
        {(['rows', 'columns'] as const).map((side) => (
          <Labelled key={side} label={side === 'rows' ? 'Rows' : 'Columns'}>
            <select name={side} defaultValue={query[side] ?? ''} className={INPUT}>
              <option value="">None</option>
              {REPORT_AXES.map((axis) => (
                <option key={axis} value={axis}>
                  {AXIS_LABELS[axis]}
                </option>
              ))}
            </select>
          </Labelled>
        ))}
        <Labelled label="Measure">
          <select name="measure" defaultValue={query.measure ?? 'sum'} className={INPUT}>
            {MEASURES.map((measure) => (
              <option key={measure} value={measure}>
                {MEASURE_LABELS[measure]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Average per">
          <select name="per" defaultValue={query.averagePer ?? 'month'} className={INPUT}>
            {TIME_AXES.map((unit) => (
              <option key={unit} value={unit}>
                {AXIS_LABELS[unit]}
              </option>
            ))}
          </select>
        </Labelled>
        <label className="flex items-center gap-2 self-center text-sm font-medium">
          <input type="checkbox" name="capital" value="1" defaultChecked={query.includeCapital} />
          Include Capital (net cash flow)
        </label>
      </fieldset>

      <fieldset className="flex flex-wrap items-start gap-3">
        <legend className="mb-2 text-sm font-semibold">Filters (none selected = all)</legend>
        <Labelled label="Accounts">
          <select name="account" multiple defaultValue={filters.accountIds} className={MULTI}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.bankName} · {account.name}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Category groups">
          <select name="group" multiple defaultValue={filters.categoryGroupIds} className={MULTI}>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Categories">
          <select name="category" multiple defaultValue={filters.categoryIds} className={MULTI}>
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
        </Labelled>
        <Labelled label="Payees">
          <select name="payee" multiple defaultValue={filters.payeeIds} className={MULTI}>
            {payees.map((payee) => (
              <option key={payee.id} value={payee.id}>
                {payee.name}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Tags">
          <select name="tag" multiple defaultValue={filters.tagIds} className={MULTI}>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Category group types">
          <select name="type" multiple defaultValue={filters.categoryGroupTypes} className={MULTI}>
            {CATEGORY_GROUP_TYPES.map((type) => (
              <option key={type} value={type}>
                {CATEGORY_GROUP_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Currencies">
          <select name="currency" multiple defaultValue={filters.currencies} className={MULTI}>
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </Labelled>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Show report
        </button>
        <Link href="/reports/builder" className="text-sm underline">
          Reset
        </Link>
        <p className="text-xs text-zinc-500">
          All values in CHF. Transfers are always left out; Capital only when included.
        </p>
      </div>
    </form>
  );
}
