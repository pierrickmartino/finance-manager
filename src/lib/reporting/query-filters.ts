import { ACCOUNT_KIND_LABELS, ACCOUNT_KINDS } from '@/server/services/accounts/input';
import type { CategoryGroupType } from '@/server/services/categories/model';
import {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
} from '@/server/services/categories/model';
import type { ReportFilters } from '@/server/services/reporting/query';

/**
 * The Widget editor's filters as plain option lists: one per filter, with its URL parameter
 * name (see `widget-params.ts`) and the values the query already selects. Nothing selected
 * means the filter lets everything through.
 */

export interface FilterOption {
  value: string;
  label: string;
  /** The heading the option sits under (a Category's Category group). */
  group?: string;
}

export interface FilterList {
  /** The URL parameter the selected values are sent as. */
  name: string;
  label: string;
  options: FilterOption[];
  selected: string[];
}

/** What the filters offer: only the fields they need of each Account, group, Payee and Tag. */
export interface FilterChoices {
  accounts: ReadonlyArray<{ id: string; bankName: string; name: string; currency: string }>;
  groups: ReadonlyArray<{
    id: string;
    name: string;
    categories: ReadonlyArray<{ id: string; name: string }>;
  }>;
  payees: ReadonlyArray<{ id: string; name: string }>;
  tags: ReadonlyArray<{ id: string; name: string }>;
}

const named = (items: ReadonlyArray<{ id: string; name: string }>): FilterOption[] =>
  items.map((item) => ({ value: item.id, label: item.name }));

function accountList(
  filters: Partial<ReportFilters>,
  accounts: FilterChoices['accounts'],
): FilterList {
  return {
    name: 'account',
    label: 'Accounts',
    options: accounts.map((account) => ({
      value: account.id,
      label: `${account.bankName} · ${account.name}`,
    })),
    selected: filters.accountIds ?? [],
  };
}

export function queryFilterLists(
  filters: Partial<ReportFilters>,
  { accounts, groups, payees, tags }: FilterChoices,
): FilterList[] {
  const currencies = [...new Set(accounts.map((account) => account.currency))].sort();
  return [
    accountList(filters, accounts),
    {
      name: 'group',
      label: 'Category groups',
      options: named(groups),
      selected: filters.categoryGroupIds ?? [],
    },
    {
      name: 'category',
      label: 'Categories',
      options: groups.flatMap((group) =>
        group.categories.map((category) => ({
          value: category.id,
          label: category.name,
          group: group.name,
        })),
      ),
      selected: filters.categoryIds ?? [],
    },
    { name: 'payee', label: 'Payees', options: named(payees), selected: filters.payeeIds ?? [] },
    { name: 'tag', label: 'Tags', options: named(tags), selected: filters.tagIds ?? [] },
    {
      name: 'type',
      label: 'Category group types',
      options: CATEGORY_GROUP_TYPES.map((type: CategoryGroupType) => ({
        value: type,
        label: CATEGORY_GROUP_TYPE_LABELS[type],
      })),
      selected: filters.categoryGroupTypes ?? [],
    },
    {
      name: 'currency',
      label: 'Currencies',
      options: currencies.map((currency) => ({ value: currency, label: currency })),
      selected: filters.currencies ?? [],
    },
  ];
}

/** What a balances Widget's filters offer: its Accounts, with their Bank. */
export type BalanceFilterChoices = ReadonlyArray<
  FilterChoices['accounts'][number] & { bankId: string }
>;

/**
 * A balances Widget's filters: only those that choose which Accounts count (Account, Bank,
 * Account kind). The Banks are those holding an Account, by name.
 */
export function balanceFilterLists(
  filters: Partial<ReportFilters>,
  accounts: BalanceFilterChoices,
): FilterList[] {
  const banks = new Map(accounts.map((account) => [account.bankId, account.bankName]));
  return [
    accountList(filters, accounts),
    {
      name: 'bank',
      label: 'Banks',
      options: [...banks]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      selected: filters.bankIds ?? [],
    },
    {
      name: 'kind',
      label: 'Account kinds',
      options: ACCOUNT_KINDS.map((kind) => ({ value: kind, label: ACCOUNT_KIND_LABELS[kind] })),
      selected: filters.accountKinds ?? [],
    },
  ];
}

/** How many filters narrow the query (have at least one value selected). */
export function activeFilterCount(lists: readonly FilterList[]): number {
  return lists.filter((list) => list.selected.length > 0).length;
}
