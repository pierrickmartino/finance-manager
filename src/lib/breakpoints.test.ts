import { describe, expect, test } from 'vitest';
import { breakpointPx, minWidthQuery } from './breakpoints';

// Tailwind's defaults: `lg` is 64rem (1024px), `xl` is 80rem (1280px).
describe('breakpoints', () => {
  test('a media query matches from the breakpoint up, in rem like Tailwind', () => {
    expect(minWidthQuery('lg')).toBe('(min-width: 64rem)');
    expect(minWidthQuery('xl')).toBe('(min-width: 80rem)');
  });

  test('a breakpoint in CSS pixels at the default root font size', () => {
    expect(breakpointPx('lg')).toBe(1024);
    expect(breakpointPx('xl')).toBe(1280);
  });
});
