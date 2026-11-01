import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { INPUT_CLASS } from '@/components/named-list';
import type { Category, CategoryGroup } from '@/server/services/categories';
import {
  deleteCategoryAction,
  mergeCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
  shiftCategoryAction,
} from './actions';
import { Menu } from '@/components/menu';
import { DANGER_BUTTON_CLASS, GHOST_BUTTON_CLASS } from '@/components/surface';
import { usageBarClass } from './styles';
import { usagePercent } from './view';

interface CategoryRowProps {
  category: Category;
  groups: CategoryGroup[];
  categories: Category[];
  /** The busiest Category's Transaction count in this group, which fills the usage bar. */
  maxCount: number;
  isFirst: boolean;
  isLast: boolean;
}

/** One Category: its name, usage and Transactions link, with every edit behind a ⋯ menu. */
export function CategoryRow({
  category,
  groups,
  categories,
  maxCount,
  isFirst,
  isLast,
}: CategoryRowProps) {
  const { id, name, groupId, groupType, transactionCount } = category;
  return (
    <li aria-labelledby={`category-${id}`} className="group flex items-center gap-4 px-4 py-2.5">
      <span id={`category-${id}`} className="min-w-0 flex-1 truncate text-sm font-medium">
        {name}
      </span>
      <div
        aria-hidden="true"
        className="hidden h-1.5 w-40 rounded-full bg-zinc-100 sm:block dark:bg-zinc-800"
      >
        <div
          className={`h-1.5 rounded-full ${usageBarClass(groupType)}`}
          style={{ width: `${usagePercent(transactionCount, maxCount)}%` }}
        />
      </div>
      <Link
        href={`/transactions?categoryId=${id}`}
        aria-label={`${transactionCount} Transaction${transactionCount === 1 ? '' : 's'} in ${name}`}
        className="w-12 text-right text-sm text-zinc-500 tabular-nums hover:underline"
      >
        {transactionCount}
      </Link>
      <Menu
        trigger="⋯"
        label={`Actions for ${name}`}
        triggerClassName={`${GHOST_BUTTON_CLASS} sm:opacity-60 sm:group-hover:opacity-100`}
      >
        <ActionForm action={renameCategoryAction.bind(null, id)} label={`Rename ${name}`}>
          <input
            name="name"
            aria-label={`Name of ${name}`}
            defaultValue={name}
            required
            maxLength={100}
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          <button type="submit" className={GHOST_BUTTON_CLASS}>
            Rename
          </button>
        </ActionForm>
        <div className="flex gap-1">
          <ActionForm
            action={shiftCategoryAction.bind(null, groupId, id, -1)}
            label={`Move ${name} up`}
          >
            <button type="submit" disabled={isFirst} className={GHOST_BUTTON_CLASS}>
              ↑ Move up
            </button>
          </ActionForm>
          <ActionForm
            action={shiftCategoryAction.bind(null, groupId, id, 1)}
            label={`Move ${name} down`}
          >
            <button type="submit" disabled={isLast} className={GHOST_BUTTON_CLASS}>
              ↓ Move down
            </button>
          </ActionForm>
        </div>
        {groups.length > 1 && (
          <ActionForm action={moveCategoryAction.bind(null, id)} label={`Move ${name}`}>
            <select
              name="groupId"
              aria-label={`Move ${name} to`}
              required
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            >
              <option value="">Move to group…</option>
              {groups
                .filter((group) => group.id !== groupId)
                .map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
            </select>
            <button type="submit" className={GHOST_BUTTON_CLASS}>
              Move
            </button>
          </ActionForm>
        )}
        {categories.length > 1 && (
          <ActionForm
            action={mergeCategoryAction.bind(null, id)}
            label={`Merge ${name}`}
            confirmMessage={`Move every Transaction of "${name}" to the chosen Category and delete "${name}"?`}
          >
            <select
              name="targetId"
              aria-label={`Merge ${name} into`}
              required
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            >
              <option value="">Merge into…</option>
              {categories
                .filter((other) => other.id !== id)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.groupName} › {other.name}
                  </option>
                ))}
            </select>
            <button type="submit" className={GHOST_BUTTON_CLASS}>
              Merge
            </button>
          </ActionForm>
        )}
        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <ActionForm
            action={deleteCategoryAction.bind(null, id)}
            label={`Delete ${name}`}
            confirmMessage={`Delete "${name}"?`}
          >
            <button type="submit" className={DANGER_BUTTON_CLASS}>
              Delete Category
            </button>
          </ActionForm>
        </div>
      </Menu>
    </li>
  );
}
