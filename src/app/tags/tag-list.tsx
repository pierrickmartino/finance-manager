import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Menu } from '@/components/menu';
import { INPUT_CLASS } from '@/components/named-list';
import { CARD_CLASS, GHOST_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/components/surface';
import type { Tag } from '@/server/services/tags';
import { createTagAction } from './actions';
import { tagHref } from './view';

interface TagListProps {
  /** The Tags the filter shows. */
  tags: Tag[];
  selectedId: string | undefined;
  query: string;
}

/** The master list: a filter, the Tags A-Z with their Transaction counts, and adding one. */
export function TagList({ tags, selectedId, query }: TagListProps) {
  return (
    <nav aria-label="Tags" className={`${CARD_CLASS} flex flex-col gap-3 p-3`}>
      {/* A GET form: the filter lives in the URL (?q=), like the selected Tag (?tag=). */}
      <form role="search" action="/tags" className="flex items-center gap-1">
        {selectedId && <input type="hidden" name="tag" value={selectedId} />}
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Filter Tags…"
          aria-label="Filter Tags"
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        {query && (
          <Link
            href={selectedId ? tagHref(selectedId, '') : '/tags'}
            className={GHOST_BUTTON_CLASS}
          >
            Clear
          </Link>
        )}
      </form>

      <ul className="flex max-h-[65vh] flex-col gap-0.5 overflow-y-auto">
        {tags.map((tag) => (
          <li key={tag.id}>
            <TagLink tag={tag} isActive={tag.id === selectedId} query={query} />
          </li>
        ))}
        {tags.length === 0 && (
          <li className="px-2 text-sm text-zinc-400">
            {query ? `No Tag matches "${query}".` : 'No Tags yet.'}
          </li>
        )}
      </ul>

      <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <Menu trigger="+ New Tag" triggerClassName={`${GHOST_BUTTON_CLASS} inline-block`}>
          <ActionForm action={createTagAction} label="New Tag" className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tag name
              <input name="name" required maxLength={100} className={INPUT_CLASS} />
            </label>
            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              Add Tag
            </button>
          </ActionForm>
        </Menu>
      </div>
    </nav>
  );
}

function TagLink({ tag, isActive, query }: { tag: Tag; isActive: boolean; query: string }) {
  return (
    <Link
      href={tagHref(tag.id, query)}
      scroll={false}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
        isActive
          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      <span className="truncate">
        <span aria-hidden="true" className={isActive ? 'opacity-60' : 'text-zinc-400'}>
          #{' '}
        </span>
        {tag.name}
      </span>
      <span className={`text-xs tabular-nums ${isActive ? 'opacity-70' : 'text-zinc-400'}`}>
        {tag.transactionCount}
      </span>
    </Link>
  );
}
