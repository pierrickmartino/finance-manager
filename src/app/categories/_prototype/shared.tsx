/* PROTOTYPE — tiny helpers shared by the Categories redesign variants. Not a layout. */
import type { CategoryGroup, CategoryGroupType } from '@/server/services/categories';

export const TYPE_ORDER: CategoryGroupType[] = ['income', 'expense', 'capital'];

export const TYPE_TONE: Record<CategoryGroupType, { dot: string; chip: string; bar: string }> = {
  income: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300',
    bar: 'bg-emerald-500/70',
  },
  expense: {
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300',
    bar: 'bg-rose-500/70',
  },
  capital: {
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300',
    bar: 'bg-sky-500/70',
  },
};

export const CARD =
  'rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900';

export const GHOST_BUTTON =
  'rounded-md px-2 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800';

export const PRIMARY_BUTTON =
  'rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200';

export function groupTotal(group: CategoryGroup): number {
  return group.categories.reduce((sum, category) => sum + category.transactionCount, 0);
}

export function TypeChip({ type, label }: { type: CategoryGroupType; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_TONE[type].chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${TYPE_TONE[type].dot}`} />
      {label}
    </span>
  );
}
