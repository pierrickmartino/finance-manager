/* PROTOTYPE — Variant A: master / detail. Groups on the left, one group's Categories on the right. */
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { INPUT_CLASS } from '@/components/named-list';
import {
  CATEGORY_GROUP_TYPE_LABELS,
  CATEGORY_GROUP_TYPES,
  type Category,
  type CategoryGroup,
} from '@/server/services/categories';
import {
  CARD,
  GHOST_BUTTON,
  groupTotal,
  PRIMARY_BUTTON,
  TYPE_ORDER,
  TYPE_TONE,
  TypeChip,
} from './shared';
import { prototypeStubAction as stub } from './stub-action';

export const VARIANT_A_NAME = 'Master / detail';

interface Props {
  groups: CategoryGroup[];
  selectedGroupId: string | undefined;
}

export function VariantA({ groups, selectedGroupId }: Props) {
  const selected = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const categories = groups.flatMap((group) => group.categories);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-sm text-zinc-500">
            {groups.length} groups · {categories.length} Categories
          </p>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <nav aria-label="Category groups" className={`${CARD} flex flex-col gap-4 p-3`}>
          {TYPE_ORDER.map((type) => {
            const ofType = groups.filter((group) => group.type === type);
            if (ofType.length === 0) return null;
            return (
              <div key={type} className="flex flex-col gap-1">
                <p className="flex items-center gap-2 px-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                  <span className={`h-1.5 w-1.5 rounded-full ${TYPE_TONE[type].dot}`} />
                  {CATEGORY_GROUP_TYPE_LABELS[type]}
                </p>
                {ofType.map((group) => {
                  const isActive = group.id === selected?.id;
                  return (
                    <Link
                      key={group.id}
                      href={`/categories?variant=A&group=${group.id}`}
                      scroll={false}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
                        isActive
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="truncate">{group.name}</span>
                      <span className={`text-xs ${isActive ? 'opacity-70' : 'text-zinc-400'}`}>
                        {group.categories.length}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
          <details className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <summary className={`${GHOST_BUTTON} cursor-pointer list-none`}>+ New group</summary>
            <ActionForm
              action={stub}
              label="New Category group"
              className="mt-2 flex flex-col gap-2"
            >
              <input name="name" placeholder="Group name" required className={INPUT_CLASS} />
              <select name="type" defaultValue="expense" className={INPUT_CLASS}>
                {CATEGORY_GROUP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CATEGORY_GROUP_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <button type="submit" className={PRIMARY_BUTTON}>
                Add group
              </button>
            </ActionForm>
          </details>
        </nav>

        {selected ? (
          <GroupDetail group={selected} groups={groups} categories={categories} />
        ) : (
          <p className="text-sm text-zinc-500">No Category groups yet.</p>
        )}
      </div>
    </section>
  );
}

function GroupDetail({
  group,
  groups,
  categories,
}: {
  group: CategoryGroup;
  groups: CategoryGroup[];
  categories: Category[];
}) {
  const max = Math.max(1, ...group.categories.map((category) => category.transactionCount));
  return (
    <div className={`${CARD} flex flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{group.name}</h2>
          <TypeChip type={group.type} label={CATEGORY_GROUP_TYPE_LABELS[group.type]} />
          <span className="text-sm text-zinc-400">{groupTotal(group)} Transactions</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={GHOST_BUTTON} aria-label="Move group up">
            ↑
          </button>
          <button type="button" className={GHOST_BUTTON} aria-label="Move group down">
            ↓
          </button>
          <details className="relative">
            <summary className={`${GHOST_BUTTON} cursor-pointer list-none`}>Edit group</summary>
            <div className={`${CARD} absolute right-0 z-10 mt-1 w-72 p-3`}>
              <ActionForm action={stub} label="Edit group" className="flex flex-col gap-2">
                <input name="name" defaultValue={group.name} className={INPUT_CLASS} />
                <select name="type" defaultValue={group.type} className={INPUT_CLASS}>
                  {CATEGORY_GROUP_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CATEGORY_GROUP_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <button type="submit" className={PRIMARY_BUTTON}>
                  Save
                </button>
              </ActionForm>
              {group.categories.length === 0 && (
                <ActionForm action={stub} label="Delete group">
                  <button type="submit" className="mt-2 text-sm text-rose-600 hover:underline">
                    Delete group
                  </button>
                </ActionForm>
              )}
            </div>
          </details>
        </div>
      </div>

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {group.categories.map((category) => (
          <li key={category.id} className="group flex items-center gap-4 px-4 py-2.5">
            <span className="cursor-grab text-zinc-300 select-none" title="Drag to reorder">
              ⋮⋮
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
            <div className="hidden w-40 items-center gap-2 sm:flex">
              <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={`h-1.5 rounded-full ${TYPE_TONE[group.type].bar}`}
                  style={{ width: `${(category.transactionCount / max) * 100}%` }}
                />
              </div>
            </div>
            <Link
              href={`/transactions?categoryId=${category.id}`}
              className="w-12 text-right text-sm text-zinc-500 tabular-nums hover:underline"
            >
              {category.transactionCount}
            </Link>
            <details className="relative">
              <summary
                className={`${GHOST_BUTTON} cursor-pointer list-none opacity-60 group-hover:opacity-100`}
              >
                ⋯
              </summary>
              <div className={`${CARD} absolute right-0 z-10 mt-1 flex w-72 flex-col gap-3 p-3`}>
                <ActionForm action={stub} label={`Rename ${category.name}`}>
                  <input name="name" defaultValue={category.name} className={INPUT_CLASS} />
                  <button type="submit" className={GHOST_BUTTON}>
                    Rename
                  </button>
                </ActionForm>
                <ActionForm action={stub} label={`Move ${category.name}`}>
                  <select name="groupId" required className={INPUT_CLASS}>
                    <option value="">Move to…</option>
                    {groups
                      .filter((other) => other.id !== group.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.name}
                        </option>
                      ))}
                  </select>
                  <button type="submit" className={GHOST_BUTTON}>
                    Move
                  </button>
                </ActionForm>
                <ActionForm action={stub} label={`Merge ${category.name}`}>
                  <select name="targetId" required className={INPUT_CLASS}>
                    <option value="">Merge into…</option>
                    {categories
                      .filter((other) => other.id !== category.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.groupName} › {other.name}
                        </option>
                      ))}
                  </select>
                  <button type="submit" className={GHOST_BUTTON}>
                    Merge
                  </button>
                </ActionForm>
                <ActionForm action={stub} label={`Delete ${category.name}`}>
                  <button type="submit" className="text-sm text-rose-600 hover:underline">
                    Delete Category
                  </button>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
        {group.categories.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-400">No Categories yet.</li>
        )}
      </ul>

      <ActionForm
        action={stub}
        label={`New Category in ${group.name}`}
        className="flex gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800"
      >
        <input
          name="name"
          placeholder={`Add a Category to ${group.name}…`}
          required
          className={`${INPUT_CLASS} flex-1`}
        />
        <button type="submit" className={PRIMARY_BUTTON}>
          Add
        </button>
      </ActionForm>
    </div>
  );
}
