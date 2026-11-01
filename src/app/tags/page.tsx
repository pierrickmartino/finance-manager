import type { Metadata } from 'next';
import { getServiceContext } from '@/server/app-context';
import { getFormatter } from '@/server/formatter';
import { getTagActivity, listTags } from '@/server/services/tags';
import { listTransactions } from '@/server/services/transactions';
import { TagDetail } from './tag-detail';
import { TagList } from './tag-list';
import { filterTags, selectTag } from './view';

export const metadata: Metadata = { title: 'Tags · Finance Manager' };

/** How many of the selected Tag's Transactions the detail pane lists. */
const RECENT_COUNT = 10;

interface TagsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The managed list of Tags (spec 58-59), as master / detail: the Tags A-Z on the left
 * (filtered by `?q=`), the selected one (`?tag=`, else the first shown) on the right with what
 * its Transactions add up to and the latest of them.
 */
export default async function TagsPage({ searchParams }: TagsPageProps) {
  const ctx = await getServiceContext();
  const [tags, fmt, params] = await Promise.all([listTags(ctx), getFormatter(), searchParams]);
  const query = typeof params.q === 'string' ? params.q : '';
  const visible = filterTags(tags, query);
  const selected = selectTag(
    tags,
    visible,
    typeof params.tag === 'string' ? params.tag : undefined,
  );
  const [activity, recent] = selected
    ? await Promise.all([
        getTagActivity(ctx, selected.id),
        listTransactions(ctx, { tagId: selected.id, pageSize: RECENT_COUNT }),
      ])
    : [null, null];

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Tags</h1>
        <p className="text-sm text-zinc-500">
          {tags.length} Tag{tags.length === 1 ? '' : 's'}
        </p>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-[16rem_1fr] lg:grid-cols-[18rem_1fr]">
        <TagList tags={visible} selectedId={selected?.id} query={query} />
        {selected && activity && recent ? (
          <TagDetail
            tag={selected}
            tags={tags}
            activity={activity}
            recent={recent.transactions}
            fmt={fmt}
          />
        ) : (
          <p className="text-sm text-zinc-500">
            {tags.length === 0
              ? 'No Tags yet. Add one here, or type a new one on a Transaction.'
              : 'Pick a Tag.'}
          </p>
        )}
      </div>
    </section>
  );
}
