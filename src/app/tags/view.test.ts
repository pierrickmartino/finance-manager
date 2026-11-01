import { describe, expect, test } from 'vitest';
import type { Tag } from '@/server/services/tags';
import { filterTags, selectTag, tagHref } from './view';

function tag(name: string, transactionCount = 0): Tag {
  return { id: `g-${name}`, name, transactionCount };
}

describe('filterTags', () => {
  const tags = [tag('Vacation 2024'), tag('VACATION 2025'), tag('Business')];

  test('keeps the Tags whose name contains the query, ignoring case', () => {
    expect(filterTags(tags, 'vacation').map((g) => g.name)).toEqual([
      'Vacation 2024',
      'VACATION 2025',
    ]);
  });

  test('keeps every Tag when the query is empty or blank', () => {
    expect(filterTags(tags, '')).toHaveLength(3);
    expect(filterTags(tags, '   ')).toHaveLength(3);
  });

  test('ignores accents and repeated spaces', () => {
    expect(filterTags([tag('Été  2025')], 'ete 2025').map((g) => g.name)).toEqual(['Été  2025']);
  });
});

describe('selectTag', () => {
  const tags = [tag('Business'), tag('Kids'), tag('Vacation')];
  const visible = [tags[1]!, tags[2]!];

  test('returns the Tag the URL names, even when the filter hides it', () => {
    expect(selectTag(tags, visible, 'g-Business')?.name).toBe('Business');
  });

  test('falls back to the first shown Tag', () => {
    expect(selectTag(tags, visible, undefined)?.name).toBe('Kids');
    expect(selectTag(tags, visible, 'g-gone')?.name).toBe('Kids');
  });

  test('returns nothing when no Tag is shown', () => {
    expect(selectTag(tags, [], undefined)).toBeUndefined();
  });
});

describe('tagHref', () => {
  test('opens the Tag, keeping the filter when there is one', () => {
    expect(tagHref('g-1', '')).toBe('/tags?tag=g-1');
    expect(tagHref('g-1', 'vacation 2025')).toBe('/tags?tag=g-1&q=vacation+2025');
  });
});
