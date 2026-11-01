import { INPUT_CLASS } from '@/components/named-list';
import {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
  type CategoryGroupType,
} from '@/server/services/categories';

export function TypeSelect({ value }: { value?: CategoryGroupType }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      Type
      <select name="type" defaultValue={value ?? 'expense'} className={INPUT_CLASS}>
        {CATEGORY_GROUP_TYPES.map((type) => (
          <option key={type} value={type}>
            {CATEGORY_GROUP_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
    </label>
  );
}

const TYPE_TONE: Record<CategoryGroupType, { dot: string; badge: string; bar: string }> = {
  income: {
    dot: 'bg-emerald-500',
    badge:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300',
    bar: 'bg-emerald-500/70',
  },
  expense: {
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300',
    bar: 'bg-rose-500/70',
  },
  capital: {
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300',
    bar: 'bg-sky-500/70',
  },
};

export function TypeDot({ type }: { type: CategoryGroupType }) {
  return <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TYPE_TONE[type].dot}`} />;
}

export function TypeBadge({ type }: { type: CategoryGroupType }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_TONE[type].badge}`}
    >
      <TypeDot type={type} />
      {CATEGORY_GROUP_TYPE_LABELS[type]}
    </span>
  );
}

export function usageBarClass(type: CategoryGroupType): string {
  return TYPE_TONE[type].bar;
}
