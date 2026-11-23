/**
 * Observing the design system's glass (spec #239, ticket #245) on a real page: how see-through
 * an element's own fill is, whether it blurs what is behind it, whether it carries an inner
 * glow, and whether the page's fixed glow is drawn. Reduced transparency has no Playwright
 * option, so it is emulated through Chromium's DevTools protocol.
 */
import type { Locator, Page } from '@playwright/test';
import { colourReader } from './colour-reader';

/** What an element's own fill looks like, as the browser computes it. */
export interface Fill {
  /** The opacity of its background colour: 0 is no fill, 1 is opaque. */
  alpha: number;
  /** Whether it blurs what is behind it (a `backdrop-filter` with a blur). */
  isBlurred: boolean;
  /** Whether it carries an inner glow (an inset shadow). */
  hasInnerGlow: boolean;
}

/**
 * The fill an element sits on: its own when it has one, else its nearest filled ancestor's
 * (`isOwn` keeps to the element itself, so a row with no fill of its own reads as none).
 */
export async function fillOf(target: Locator, { isOwn = false } = {}): Promise<Fill> {
  const reader = await colourReader(target.page());
  return target.evaluate(
    (start, { reader, isOwn }) => {
      let element: Element | null = start;
      while (!isOwn && element && reader.alpha(getComputedStyle(element).backgroundColor) === 0)
        element = element.parentElement;
      const style = getComputedStyle(element ?? start);
      return {
        alpha: reader.alpha(style.backgroundColor),
        isBlurred: /blur\(/.test(style.backdropFilter),
        hasInnerGlow: /inset/.test(style.boxShadow),
      };
    },
    { reader, isOwn },
  );
}

/** A named region of the page's content that is a glass container of its own. */
export interface GlassRegion {
  name: string;
  hasInnerGlow: boolean;
}

/**
 * Every named region (`<section>`) of the page's content that is glass and not inside another
 * glass container: on the Dashboard and Analytics, each tile and any card beside them.
 */
export function glassRegions(page: Page): Promise<GlassRegion[]> {
  return page.locator('main').evaluate((main) => {
    const isGlass = (element: Element) => /blur\(/.test(getComputedStyle(element).backdropFilter);
    const isInGlass = (element: Element) => {
      for (let node = element.parentElement; node && node !== main; node = node.parentElement)
        if (isGlass(node)) return true;
      return false;
    };
    const nameOf = (element: Element) => {
      const labelledBy = element.getAttribute('aria-labelledby');
      const label = labelledBy ? document.getElementById(labelledBy)?.textContent : null;
      return (label ?? element.getAttribute('aria-label') ?? '').trim();
    };
    return [...main.querySelectorAll('section[aria-label], section[aria-labelledby]')]
      .filter((section) => isGlass(section) && !isInGlass(section))
      .map((section) => ({
        name: nameOf(section),
        hasInnerGlow: /inset/.test(getComputedStyle(section).boxShadow),
      }));
  });
}

/** Every element on the page that is see-through and blurs what is behind it: the glass. */
export function glassCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll('body *')].filter((element) =>
        /blur\(/.test(getComputedStyle(element).backdropFilter),
      ).length,
  );
}

/**
 * The page's glow: a gradient layer drawn behind the content on the page itself (a pseudo
 * element of the document or its body), and whether it stays put when the page scrolls.
 */
export function pageGlow(page: Page): Promise<{ isDrawn: boolean; isFixed: boolean }> {
  return page.evaluate(() => {
    const layers = [document.documentElement, document.body].flatMap((element) =>
      ['::before', '::after'].map((pseudo) => getComputedStyle(element, pseudo)),
    );
    const glow = layers.find(
      (style) =>
        style.content !== 'none' &&
        style.display !== 'none' &&
        /gradient\(/.test(style.backgroundImage),
    );
    return { isDrawn: glow !== undefined, isFixed: glow?.position === 'fixed' };
  });
}

/** Emulates the system's "reduce transparency" setting for this page, across navigations. */
export async function emulateReducedTransparency(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
}

/**
 * Applies, unconditionally, the app's stylesheet rules meant for browsers without
 * `backdrop-filter` (its `@supports not (backdrop-filter…)` blocks), as such a browser would.
 * Returns how many rules were applied, so a missing fallback fails loudly.
 */
export async function applyNoBackdropFilterFallback(page: Page): Promise<number> {
  const css = await page.evaluate(() => {
    const found: string[] = [];
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (
          rule instanceof CSSSupportsRule &&
          /^\s*not\b/.test(rule.conditionText) &&
          rule.conditionText.includes('backdrop-filter')
        ) {
          found.push(...[...rule.cssRules].map((inner) => inner.cssText));
        } else if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) {
          visit(rule.cssRules);
        }
      }
    };
    for (const sheet of document.styleSheets) visit(sheet.cssRules);
    return found;
  });
  if (css.length > 0) await page.addStyleTag({ content: css.join('\n') });
  return css.length;
}
