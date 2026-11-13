import { expect, test, type Page } from '@playwright/test';
import { viewTransitionAnimationsDuring } from './support/view-transitions';

/*
 * The navigation motion foundation (ADR-0012), checked against the app's own stylesheet. No
 * page names an element to animate yet, so these run a view transition directly; the
 * Dashboard and Transactions specs use the same helper on real navigations.
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
