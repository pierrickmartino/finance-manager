import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { INPUT_CLASS } from '@/components/named-list';
import { CATEGORY_GROUP_TYPE_LABELS, type CategoryGroup } from '@/server/services/categories';
import { createGroupAction } from './actions';
import { Menu } from '@/components/menu';
import { CARD_CLASS, GHOST_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import { TypeDot, TypeSelect } from './styles';
import { groupsByType } from './view';

interface GroupListProps {
  groups: CategoryGroup[];
  selectedId: string | undefined;
}

/** The master list: every group, sectioned by type, linking to its detail. */
export function GroupList({ groups, selectedId }: GroupListProps) {
  return (
    <nav aria-label="Category groups" className={`${CARD_CLASS} flex flex-col gap-4 p-3`}>
      {groupsByType(groups).map(({ type, groups: ofType }) => (
        <div key={type} className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 px-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            <TypeDot type={type} />
            {CATEGORY_GROUP_TYPE_LABELS[type]}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {ofType.map((group) => (
              <li key={group.id}>
                <GroupLink group={group} isActive={group.id === selectedId} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <Menu trigger="+ New group" triggerClassName={`${GHOST_BUTTON_CLASS} inline-block`}>
          <ActionForm
            action={createGroupAction}
            label="New Category group"
            className="flex flex-col gap-2"
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              Group name
              <input name="name" required maxLength={100} className={INPUT_CLASS} />
            </label>
            <TypeSelect />
            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              Add group
            </button>
          </ActionForm>
        </Menu>
      </div>
    </nav>
  );
}

function GroupLink({ group, isActive }: { group: CategoryGroup; isActive: boolean }) {
  const count = group.categories.length;
  return (
    <Link
      href={`/categories?group=${group.id}`}
      scroll={false}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
        isActive
          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      <span className="truncate">{group.name}</span>
      <span className={`text-xs tabular-nums ${isActive ? 'opacity-70' : 'text-zinc-400'}`}>
        {count}
      </span>
    </Link>
  );
}
