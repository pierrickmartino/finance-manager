import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { listCategoryGroups, seedStarterCategories } from '@/server/services/categories';
import { GroupDetail } from './group-detail';
import { GroupList } from './group-list';
import { selectGroup } from './view';

export const metadata: Metadata = { title: 'Categories · Finance Manager' };

interface CategoriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Category groups and Categories (spec 49-57), as master / detail: the groups by type on the
 * left, the selected group (`?group=`, else the first) and its Categories on the right.
 */
export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const ctx = await getServiceContext();
  // First run happens at setup; this covers a database set up before Categories existed.
  await seedStarterCategories(ctx);
  const groups = await listCategoryGroups(ctx);
  const categories = groups.flatMap((group) => group.categories);
  const { group: groupParam } = await searchParams;
  const selected = selectGroup(groups, typeof groupParam === 'string' ? groupParam : undefined);
  const sameType = groups.filter((group) => group.type === selected?.type);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-zinc-500">
          {groups.length} group{groups.length === 1 ? '' : 's'} · {categories.length}{' '}
          {categories.length === 1 ? 'Category' : 'Categories'}
        </p>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-[16rem_1fr] lg:grid-cols-[18rem_1fr]">
        <GroupList groups={groups} selectedId={selected?.id} />
        {selected ? (
          <GroupDetail
            group={selected}
            groups={groups}
            categories={categories}
            isFirstOfType={sameType[0]?.id === selected.id}
            isLastOfType={sameType.at(-1)?.id === selected.id}
          />
        ) : (
          <p className="text-sm text-zinc-500">No Category groups yet.</p>
        )}
      </div>
    </section>
  );
}
