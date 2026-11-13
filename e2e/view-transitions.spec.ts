import { expect, test, type Page } from '@playwright/test';
import {
  viewTransitionAnimationsDuring,
  viewTransitionMotionDuring,
} from './support/view-transitions';

/*
 * The navigation motion foundation (ADR-0012), checked against the app's own stylesheet, and
 * the helpers that observe it. These run a view transition directly, so what they check holds
 * whatever a page names; the Dashboard and Transactions specs use the same helpers on real
 * navigations.
 */

/** Runs one view transition on the current page, as a route navigation would. */
function runViewTransition(page: Page): Promise<void> {
  return page.evaluate(() => document.startViewTransition(() => undefined).finished);
}

test('a view transition animates with the navigation motion tokens', async ({ page }) => {
  await page.goto('/transactions');

  const animations = await viewTransitionAnimationsDuring(page, () => runViewTransition(page));

  expect(animations.length).toBeGreaterThan(0);
  for (const animation of animations) {
    expect(animation.duration, animation.pseudoElement).toBe(250);
    expect(animation.easing, animation.pseudoElement).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  }
});

test('under reduced motion a view transition swaps instantly, with no animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/transactions');

  const animations = await viewTransitionAnimationsDuring(page, () => runViewTransition(page));

  expect(animations).toEqual([]);
});

test('no view-transition animation is reported when none ran', async ({ page }) => {
  await page.goto('/transactions');

  const animations = await viewTransitionAnimationsDuring(page, () =>
    page.evaluate(() => document.body.getBoundingClientRect()),
  );

  expect(animations).toEqual([]);
});

test('motion leaves out instant (0ms) view-transition animations', async ({ page }) => {
  await page.goto('/transactions');
  // The root's group made instant, like React's own housekeeping animations.
  await page.addStyleTag({ content: '::view-transition-group(root) { animation-duration: 0s; }' });

  const all = await viewTransitionAnimationsDuring(page, () => runViewTransition(page));
  const motion = await viewTransitionMotionDuring(page, () => runViewTransition(page));

  const instant = '::view-transition-group(root)';
  expect(all.map((animation) => animation.pseudoElement)).toContain(instant);
  expect(motion.length).toBeGreaterThan(0);
  expect(motion.map((animation) => animation.pseudoElement)).not.toContain(instant);
});
