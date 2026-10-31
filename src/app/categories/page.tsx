import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { BUTTON_CLASS, INPUT_CLASS } from '@/components/named-list';
import { getServiceContext } from '@/server/app-context';
import {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
  listCategoryGroups,
  seedStarterCategories,
  type Category,
  type CategoryGroup,
  type CategoryGroupType,
} from '@/server/services/categories';
import {
  createCategoryAction,
  createGroupAction,
  deleteCategoryAction,
  deleteGroupAction,
  mergeCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
  shiftCategoryAction,
  shiftGroupAction,
  updateGroupAction,
} from './actions';

export const metadata: Metadata = { title: 'Categories · Finance Manager' };

/** Category groups and Categories (spec 49-57). */
export default async function CategoriesPage() {
  const ctx = await getServiceContext();
  // First run happens at setup; this covers a database set up before Categories existed.
  await seedStarterCategories(ctx);
  const groups = await listCategoryGroups(ctx);
  const categories = groups.flatMap((group) => group.categories);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Categories</h1>
      <ActionForm action={createGroupAction} label="New Category group">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Group name
          <input name="name" required maxLength={100} className={INPUT_CLASS} />
        </label>
        <TypeSelect label="Type" />
        <button type="submit" className={BUTTON_CLASS}>
          Add group
        </button>
      </ActionForm>
      {groups.length === 0 && <p className="text-sm text-zinc-500">No Category groups yet.</p>}
      {groups.map((group, index) => (
        <GroupSection
          key={group.id}
          group={group}
          groups={groups}
          categories={categories}
          isFirst={index === 0}
          isLast={index === groups.length - 1}
        />
      ))}
    </section>
  );
}

function TypeSelect({ label, value }: { label: string; value?: CategoryGroupType }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
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

interface GroupSectionProps {
  group: CategoryGroup;
  groups: CategoryGroup[];
  categories: Category[];
  isFirst: boolean;
  isLast: boolean;
}

function GroupSection({ group, groups, categories, isFirst, isLast }: GroupSectionProps) {
  return (
    <section
      aria-label={`Group ${group.name}`}
      className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-lg font-semibold">
          {group.name}{' '}
          <span className="text-sm font-normal text-zinc-500">
            {CATEGORY_GROUP_TYPE_LABELS[group.type]}
          </span>
        </h2>
        <ActionForm action={updateGroupAction.bind(null, group.id)} label={`Edit ${group.name}`}>
          <input
            name="name"
            aria-label={`Name of group ${group.name}`}
            defaultValue={group.name}
            required
            maxLength={100}
            className={INPUT_CLASS}
          />
          <TypeSelect label="Type" value={group.type} />
          <button type="submit" className={BUTTON_CLASS}>
            Save
          </button>
        </ActionForm>
        <ShiftButtons
          name={group.name}
          up={isFirst ? null : shiftGroupAction.bind(null, group.id, -1)}
          down={isLast ? null : shiftGroupAction.bind(null, group.id, 1)}
        />
        {group.categories.length === 0 && (
          <ActionForm
            action={deleteGroupAction.bind(null, group.id)}
            label={`Delete group ${group.name}`}
            confirmMessage={`Delete the group "${group.name}"?`}
          >
            <button type="submit" className={BUTTON_CLASS}>
              Delete group
            </button>
          </ActionForm>
        )}
      </div>
      <ul aria-label={`Categories of ${group.name}`} className="flex flex-col gap-2">
        {group.categories.map((category, index) => (
          <CategoryRow
            key={category.id}
            category={category}
            groups={groups}
            categories={categories}
            isFirst={index === 0}
            isLast={index === group.categories.length - 1}
          />
        ))}
      </ul>
      <ActionForm
        action={createCategoryAction.bind(null, group.id)}
        label={`New Category in ${group.name}`}
      >
        <input
          name="name"
          aria-label={`New Category in ${group.name}`}
          placeholder="New Category"
          required
          maxLength={100}
          className={INPUT_CLASS}
        />
        <button type="submit" className={BUTTON_CLASS}>
          Add Category
        </button>
      </ActionForm>
    </section>
  );
}

interface CategoryRowProps {
  category: Category;
  groups: CategoryGroup[];
  categories: Category[];
  isFirst: boolean;
  isLast: boolean;
}

function CategoryRow({ category, groups, categories, isFirst, isLast }: CategoryRowProps) {
  const { id, name, groupId } = category;
  return (
    <li className="flex flex-wrap items-start gap-3 border-t border-zinc-100 pt-2 dark:border-zinc-900">
      <ActionForm action={renameCategoryAction.bind(null, id)} label={`Rename ${name}`}>
        <input
          name="name"
          aria-label={`Name of ${name}`}
          defaultValue={name}
          required
          maxLength={100}
          className={INPUT_CLASS}
        />
        <button type="submit" className={BUTTON_CLASS}>
          Rename
        </button>
      </ActionForm>
      <Link href={`/transactions?categoryId=${id}`} className="py-1 text-sm underline">
        {category.transactionCount} Transaction{category.transactionCount === 1 ? '' : 's'}
      </Link>
      <ShiftButtons
        name={name}
        up={isFirst ? null : shiftCategoryAction.bind(null, groupId, id, -1)}
        down={isLast ? null : shiftCategoryAction.bind(null, groupId, id, 1)}
      />
      {groups.length > 1 && (
        <ActionForm action={moveCategoryAction.bind(null, id)} label={`Move ${name}`}>
          <select name="groupId" aria-label={`Move ${name} to`} required className={INPUT_CLASS}>
            <option value="">Move to…</option>
            {groups
              .filter((group) => group.id !== groupId)
              .map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
          </select>
          <button type="submit" className={BUTTON_CLASS}>
            Move
          </button>
        </ActionForm>
      )}
      <ActionForm
        action={mergeCategoryAction.bind(null, id)}
        label={`Merge ${name}`}
        confirmMessage={`Move every Transaction of "${name}" to the chosen Category and delete "${name}"?`}
      >
        <select name="targetId" aria-label={`Merge ${name} into`} required className={INPUT_CLASS}>
          <option value="">Merge into…</option>
          {categories
            .filter((other) => other.id !== id)
            .map((other) => (
              <option key={other.id} value={other.id}>
                {other.groupName} › {other.name}
              </option>
            ))}
        </select>
        <button type="submit" className={BUTTON_CLASS}>
          Merge
        </button>
      </ActionForm>
      <ActionForm
        action={deleteCategoryAction.bind(null, id)}
        label={`Delete ${name}`}
        confirmMessage={`Delete "${name}"?`}
      >
        <button type="submit" className={BUTTON_CLASS}>
          Delete
        </button>
      </ActionForm>
    </li>
  );
}

type ShiftAction = Parameters<typeof ActionForm>[0]['action'];

function ShiftButtons({
  name,
  up,
  down,
}: {
  name: string;
  up: ShiftAction | null;
  down: ShiftAction | null;
}) {
  return (
    <div className="flex gap-1">
      {up && (
        <ActionForm action={up} label={`Move ${name} up`}>
          <button type="submit" aria-label={`Move ${name} up`} className={BUTTON_CLASS}>
            ↑
          </button>
        </ActionForm>
      )}
      {down && (
        <ActionForm action={down} label={`Move ${name} down`}>
          <button type="submit" aria-label={`Move ${name} down`} className={BUTTON_CLASS}>
            ↓
          </button>
        </ActionForm>
      )}
    </div>
  );
}
