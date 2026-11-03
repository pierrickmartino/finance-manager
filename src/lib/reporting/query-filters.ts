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

export function queryFilterLists(
  filters: Partial<ReportFilters>,
  { accounts, groups, payees, tags }: FilterChoices,
): FilterList[] {
  const currencies = [...new Set(accounts.map((account) => account.currency))].sort();
  return [
    {
      name: 'account',
      label: 'Accounts',
      options: accounts.map((account) => ({
        value: account.id,
        label: `${account.bankName} · ${account.name}`,
      })),
      selected: filters.accountIds ?? [],
    },
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

/** How many filters narrow the query (have at least one value selected). */
export function activeFilterCount(lists: readonly FilterList[]): number {
  return lists.filter((list) => list.selected.length > 0).length;
}
