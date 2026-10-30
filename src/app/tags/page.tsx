import type { Metadata } from 'next';
import { NamedList } from '@/components/named-list';
import { getServiceContext } from '@/server/app-context';
import { listTags } from '@/server/services/tags';
import { createTagAction, deleteTagAction, mergeTagAction, renameTagAction } from './actions';

export const metadata: Metadata = { title: 'Tags · Finance Manager' };

/** The managed list of Tags (spec 58-59). */
export default async function TagsPage() {
  const tags = await listTags(await getServiceContext());
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Tags</h1>
      <NamedList
        noun="Tag"
        items={tags}
        create={createTagAction}
        rename={(id) => renameTagAction.bind(null, id)}
        merge={(id) => mergeTagAction.bind(null, id)}
        remove={(id) => deleteTagAction.bind(null, id)}
        listHref={(id) => `/transactions?tagId=${id}`}
        deleteHint="It is removed from every Transaction."
      />
    </section>
  );
}
