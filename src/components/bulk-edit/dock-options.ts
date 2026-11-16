import { transactionCountLabel } from '@/lib/text';
import type { CategoryGroup } from '@/server/services/categories';
import type { BulkEditResult } from '@/server/services/transactions/bulk-edit';

/**
 * What the Bulk edit dock's pickers offer for what has been typed: plain functions of the
 * lists and the selection, so the dock itself only renders them.
 */

interface Named {
  id: string;
  name: string;
}

/** Whether `name` holds `query`, ignoring case; an empty query matches everything. */
export function matchesQuery(name: string, query: string): boolean {
  return name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

function isSameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** The Category groups with only their Categories matching `query`; empty groups drop out. */
export function filterCategoryGroups(groups: CategoryGroup[], query: string): CategoryGroup[] {
  return groups
    .map((group) => ({
      ...group,
      categories: group.categories.filter((category) => matchesQuery(category.name, query)),
    }))
    .filter((group) => group.categories.length > 0);
}

export interface NameChoices {
  /** The existing names matching the query. */
  matches: string[];
  /** The query as a new name, when it is not blank and no existing name equals it. */
  newName: string | null;
}

/** Existing names matching what was typed, and whether it would be a new one. */
export function nameChoices(names: readonly string[], query: string): NameChoices {
  const typed = query.trim();
  const isTaken = names.some((name) => isSameName(name, typed));
  return {
    matches: names.filter((name) => matchesQuery(name, typed)),
    newName: typed !== '' && !isTaken ? typed : null,
  };
}

/** `all`, `some` or `none` of the selected Transactions carry the Tag; `unknown` beyond the page. */
export type TagState = 'all' | 'some' | 'none' | 'unknown';

export interface TagOption extends Named {
  state: TagState;
  /** How many selected Transactions carry it (0 when unknown). */
  carriers: number;
}

/**
 * Every Tag with how much of the selection carries it. `selectedTags` holds each ticked
 * Transaction's Tags; null when the selection reaches beyond the page, so it is unknown.
 */
export function tagOptions(
  tags: readonly Named[],
  selectedTags: readonly (readonly Named[])[] | null,
): TagOption[] {
  if (selectedTags === null) {
    return tags.map(({ id, name }) => ({ id, name, state: 'unknown', carriers: 0 }));
  }
  const carriers = new Map<string, number>();
  for (const tag of selectedTags.flat()) carriers.set(tag.id, (carriers.get(tag.id) ?? 0) + 1);
  return tags.map(({ id, name }) => {
    const count = carriers.get(id) ?? 0;
    const state: TagState = count === 0 ? 'none' : count === selectedTags.length ? 'all' : 'some';
    return { id, name, state, carriers: count };
  });
}

/**
 * What an applied edit reports: how many Transactions it changed (a selected one that already
 * had the value is locked but unchanged), and how many it left out, e.g.
 * "Set Groceries: 3 Transactions changed · 1 split or Transfer left out."
 */
export function bulkResultMessage(label: string, { count, leftOut }: BulkEditResult): string {
  const leftOutPart = leftOut > 0 ? ` · ${leftOut} split or Transfer left out` : '';
  return `${label}: ${transactionCountLabel(count)} changed${leftOutPart}.`;
}
