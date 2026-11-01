import { normalizeText } from '@/lib/text';
import type { Tag } from '@/server/services/tags';

/**
 * The Tags whose name contains the query (ignoring case, accents and repeated spaces); all of
 * them for a blank one.
 */
export function filterTags(tags: Tag[], query: string): Tag[] {
  const needle = normalizeText(query);
  return needle ? tags.filter((tag) => normalizeText(tag.name).includes(needle)) : tags;
}

/**
 * The Tag shown in the detail pane: the one the URL names (even when the filter hides it),
 * else the first one the list shows.
 */
export function selectTag(tags: Tag[], visible: Tag[], tagId: string | undefined): Tag | undefined {
  return tags.find((tag) => tag.id === tagId) ?? visible[0];
}

/** The Tags page with this Tag open, keeping the list's filter. */
export function tagHref(tagId: string, query: string): string {
  const params = new URLSearchParams({ tag: tagId });
  if (query) params.set('q', query);
  return `/tags?${params.toString()}`;
}
