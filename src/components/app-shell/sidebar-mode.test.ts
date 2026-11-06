import { describe, expect, test } from 'vitest';
import { SIDEBAR_COOKIE, parseSidebarMode, sidebarModeCookie } from './sidebar-mode';

describe('parseSidebarMode', () => {
  test('reads a saved rail', () => {
    expect(parseSidebarMode('rail')).toBe('rail');
  });

  test('reads a saved pinned sidebar', () => {
    expect(parseSidebarMode('pinned')).toBe('pinned');
  });

  test('defaults to pinned when nothing is saved', () => {
    expect(parseSidebarMode(undefined)).toBe('pinned');
  });

  test('falls back to pinned for an unknown value', () => {
    expect(parseSidebarMode('collapsed')).toBe('pinned');
  });
});

describe('sidebarModeCookie', () => {
  test('saves the mode site-wide for a year', () => {
    expect(sidebarModeCookie('rail')).toBe(
      `${SIDEBAR_COOKIE}=rail; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
  });
});
