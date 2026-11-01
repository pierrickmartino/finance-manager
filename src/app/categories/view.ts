import type { CategoryGroup, CategoryGroupType } from '@/server/services/categories';

/** The order the group list sections the types in. */
export const TYPE_ORDER: readonly CategoryGroupType[] = ['income', 'expense', 'capital'];

export interface TypeSection {
  type: CategoryGroupType;
  groups: CategoryGroup[];
}

/** The group shown in the detail pane: the one the URL names, else the first. */
export function selectGroup(
  groups: CategoryGroup[],
  groupId: string | undefined,
): CategoryGroup | undefined {
  return groups.find((group) => group.id === groupId) ?? groups[0];
}

/** Groups sectioned by type, each section keeping the groups' order; empty sections left out. */
export function groupsByType(groups: CategoryGroup[]): TypeSection[] {
  return TYPE_ORDER.map((type) => ({
    type,
    groups: groups.filter((group) => group.type === type),
  })).filter((section) => section.groups.length > 0);
}

export function transactionTotal(group: CategoryGroup): number {
  return group.categories.reduce((sum, category) => sum + category.transactionCount, 0);
}

/** A Category's usage bar width: its share of the busiest Category in the group. */
export function usagePercent(count: number, max: number): number {
  return max > 0 ? (count / max) * 100 : 0;
}
