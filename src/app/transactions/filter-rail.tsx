import Link from 'next/link';
import { CARD_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { Account } from '@/server/services/accounts';
import {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
  type CategoryGroup,
} from '@/server/services/categories';
import type { Payee } from '@/server/services/payees';
import type { Tag } from '@/server/services/tags';
import { transactionsExportHref, type SearchValues } from './search';

const INPUT =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400';

export interface FilterLists {
  accounts: Account[];
  groups: CategoryGroup[];
  payees: Payee[];
  tags: Tag[];
}

interface FilterRailProps {
  values: SearchValues;
  lists: FilterLists;
}

/** The search form as a column beside the list: a GET form, so every search is a URL. */
export function FilterRail({ values, lists }: FilterRailProps) {
  return (
    // Keyed on the values so the fields follow client-side navigation between searches.
    <form
      key={JSON.stringify(values)}
      method="get"
      action="/transactions"
      aria-label="Search Transactions"
      className={`${CARD_CLASS} flex h-fit flex-col gap-3 p-3 lg:sticky lg:top-4`}
    >
      <TextField
        label="Search"
        name="text"
        value={values.text}
        placeholder="Description, name, reference"
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
        <TextField label="From" name="from" type="date" value={values.from} />
        <TextField label="To" name="to" type="date" value={values.to} />
        <Select
          label="Account"
          name="accountId"
          value={values.accountId}
          options={lists.accounts.map((account) => [account.id, account.name])}
        />
        <Select
          label="Payee"
          name="payeeId"
          value={values.payeeId}
          options={lists.payees.map((payee) => [payee.id, payee.name])}
        />
        <CategorySelect value={values.categoryId} groups={lists.groups} />
        <Select
          label="Group type"
          name="groupType"
          value={values.groupType}
          options={CATEGORY_GROUP_TYPES.map((type) => [type, CATEGORY_GROUP_TYPE_LABELS[type]])}
        />
        <Select
          label="Tag"
          name="tagId"
          value={values.tagId}
          options={lists.tags.map((tag) => [tag.id, tag.name])}
        />
        <Select
          label="Status"
          name="status"
          value={values.status}
          options={[
            ['imported', 'Imported'],
            ['manual', 'Manual'],
          ]}
        />
        <TextField label="Amount from" name="amountMin" value={values.amountMin} />
        <TextField label="Amount to" name="amountMax" value={values.amountMax} />
        <Select
          label="Transfers"
          name="transfer"
          value={values.transfer}
          allLabel="Included"
          options={[
            ['only', 'Only Transfers'],
            ['exclude', 'Excluded'],
          ]}
        />
        <label className="flex items-center gap-2 self-end py-1.5 text-sm">
          <input
            type="checkbox"
            name="unclassified"
            value="true"
            defaultChecked={values.unclassified === 'true'}
          />
          Unclassified only
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        Amounts are signed: expenses are negative, so &quot;Amount to&quot; 0 lists only expenses.
      </p>
      <button type="submit" className={PRIMARY_BUTTON_CLASS}>
        Search
      </button>
      <div className="flex justify-between text-xs">
        <Link href="/transactions" className="underline">
          Clear
        </Link>
        {/* A plain link: the route streams a file download, there is nothing to prefetch. */}
        <a
          href={transactionsExportHref(values)}
          download
          className="underline"
          title="Every Transaction matching the filters, for Excel"
        >
          Export CSV
        </a>
      </div>
    </form>
  );
}

interface TextFieldProps {
  label: string;
  name: string;
  value: string;
  type?: string;
  placeholder?: string;
}

function TextField({ label, name, value, type = 'text', placeholder }: TextFieldProps) {
  return (
    <label className={LABEL}>
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

interface SelectProps {
  label: string;
  name: string;
  value: string;
  options: (readonly [value: string, text: string])[];
  allLabel?: string;
}

function Select({ label, name, value, options, allLabel = 'All' }: SelectProps) {
  return (
    <label className={LABEL}>
      {label}
      <select name={name} defaultValue={value} className={INPUT}>
        <option value="">{allLabel}</option>
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function CategorySelect({ value, groups }: { value: string; groups: CategoryGroup[] }) {
  return (
    <label className={LABEL}>
      Category
      <select name="categoryId" defaultValue={value} className={INPUT}>
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
  );
}
