import { ActionForm } from '@/components/action-form';
import { INPUT_CLASS } from '@/components/named-list';
import type { Category, CategoryGroup } from '@/server/services/categories';
import {
  createCategoryAction,
  deleteGroupAction,
  shiftGroupAction,
  updateGroupAction,
} from './actions';
import { CategoryRow } from './category-row';
import { Menu } from '@/components/menu';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '@/components/surface';
import { TypeBadge, TypeSelect } from './styles';
import { transactionTotal } from './view';

interface GroupDetailProps {
  group: CategoryGroup;
  groups: CategoryGroup[];
  categories: Category[];
  /** First / last among the groups of its type: the list shows the groups by type. */
  isFirstOfType: boolean;
  isLastOfType: boolean;
}

/** The detail pane: one group's header and edits, its Categories, and adding one. */
export function GroupDetail({
  group,
  groups,
  categories,
  isFirstOfType,
  isLastOfType,
}: GroupDetailProps) {
  const total = transactionTotal(group);
  const maxCount = Math.max(0, ...group.categories.map((category) => category.transactionCount));
  return (
    <section aria-label={`Group ${group.name}`} className={`${CARD_CLASS} flex min-w-0 flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{group.name}</h2>
          <TypeBadge type={group.type} />
          <span className="text-sm text-zinc-400">
            {total} Transaction{total === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ActionForm
            action={shiftGroupAction.bind(null, group.id, -1)}
            label={`Move ${group.name} up`}
          >
            <button
              type="submit"
              aria-label={`Move ${group.name} up`}
              disabled={isFirstOfType}
              className={GHOST_BUTTON_CLASS}
            >
              ↑
            </button>
          </ActionForm>
          <ActionForm
            action={shiftGroupAction.bind(null, group.id, 1)}
            label={`Move ${group.name} down`}
          >
            <button
              type="submit"
              aria-label={`Move ${group.name} down`}
              disabled={isLastOfType}
              className={GHOST_BUTTON_CLASS}
            >
              ↓
            </button>
          </ActionForm>
          <Menu trigger="Edit group" triggerClassName={GHOST_BUTTON_CLASS}>
            <ActionForm
              action={updateGroupAction.bind(null, group.id)}
              label={`Edit ${group.name}`}
              className="flex flex-col gap-2"
            >
              <label className="flex flex-col gap-1 text-sm font-medium">
                Group name
                <input
                  name="name"
                  defaultValue={group.name}
                  required
                  maxLength={100}
                  className={INPUT_CLASS}
                />
              </label>
              <TypeSelect value={group.type} />
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                Save
              </button>
            </ActionForm>
            {group.categories.length === 0 && (
              <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <ActionForm
                  action={deleteGroupAction.bind(null, group.id)}
                  label={`Delete group ${group.name}`}
                  confirmMessage={`Delete the group "${group.name}"?`}
                >
                  <button type="submit" className={DANGER_BUTTON_CLASS}>
                    Delete group
                  </button>
                </ActionForm>
              </div>
            )}
          </Menu>
        </div>
      </div>

      <ul
        aria-label={`Categories of ${group.name}`}
        className="divide-y divide-zinc-100 dark:divide-zinc-800"
      >
        {group.categories.map((category, index) => (
          <CategoryRow
            key={category.id}
            category={category}
            groups={groups}
            categories={categories}
            maxCount={maxCount}
            isFirst={index === 0}
            isLast={index === group.categories.length - 1}
          />
        ))}
      </ul>
      {group.categories.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-zinc-400">
          No Categories yet. An empty group can be deleted from Edit group.
        </p>
      )}

      <ActionForm
        action={createCategoryAction.bind(null, group.id)}
        label={`New Category in ${group.name}`}
        className="flex gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800"
      >
        <input
          name="name"
          aria-label={`New Category in ${group.name}`}
          placeholder={`Add a Category to ${group.name}…`}
          required
          maxLength={100}
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          Add Category
        </button>
      </ActionForm>
    </section>
  );
}
