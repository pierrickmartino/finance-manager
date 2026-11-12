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
    dot: 'bg-positive',
    badge: 'bg-positive-tint text-positive ring-positive/20',
    bar: 'bg-positive/70',
  },
  expense: {
    dot: 'bg-negative',
    badge: 'bg-negative-tint text-negative ring-negative/20',
    bar: 'bg-negative/70',
  },
  capital: {
    dot: 'bg-info',
    badge: 'bg-info-tint text-info ring-info/20',
    bar: 'bg-info/70',
  },
};

export function TypeDot({ type }: { type: CategoryGroupType }) {
  return <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TYPE_TONE[type].dot}`} />;
}

export function TypeBadge({ type }: { type: CategoryGroupType }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_TONE[type].badge}`}
    >
      <TypeDot type={type} />
      {CATEGORY_GROUP_TYPE_LABELS[type]}
    </span>
  );
}

export function usageBarClass(type: CategoryGroupType): string {
  return TYPE_TONE[type].bar;
}
