import { describe, expect, test } from 'vitest';
import { NAV_GROUPS, findCurrentPage, isActive } from './navigation';

describe('isActive', () => {
  test('matches the exact path', () => {
    expect(isActive('/transactions', '/transactions')).toBe(true);
  });

  test('matches nested paths under the link', () => {
    expect(isActive('/accounts/42/imports/7', '/accounts')).toBe(true);
  });

  test('does not match a path that only shares a prefix', () => {
    expect(isActive('/tagsets', '/tags')).toBe(false);
  });
});

describe('findCurrentPage', () => {
  test('returns the group and link for a top-level page', () => {
    const current = findCurrentPage('/payees');

    expect(current?.group.label).toBe('Organize');
    expect(current?.link.label).toBe('Payees');
  });

  test('returns the parent link for a detail page', () => {
    const current = findCurrentPage('/rules/abc/');

    expect(current?.group.label).toBe('Organize');
    expect(current?.link.label).toBe('Rules');
  });

  test('returns null for a page outside the navigation', () => {
    expect(findCurrentPage('/imports/xyz')).toBeNull();
  });
});

describe('NAV_GROUPS', () => {
  test('lists every destination exactly once', () => {
    const hrefs = NAV_GROUPS.flatMap((group) => group.links.map((link) => link.href));

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/dashboards',
        '/reports',
        '/transactions',
        '/unclassified',
        '/accounts',
        '/categories',
        '/payees',
        '/tags',
        '/rules',
        '/banks',
        '/history',
        '/settings',
      ]),
    );
    expect(hrefs).toHaveLength(12);
  });
});
