/**
 * Measuring the design system's colours on a real page (spec #239): each visible piece of text
 * and the focused element's outline against the background actually behind it, as computed.
 * The browser reports colours and the layers behind an element; the ratio is worked out here,
 * with the same helper as the colour-data unit test.
 */
import type { JSHandle, Locator, Page } from '@playwright/test';
import {
  AA_NON_TEXT,
  AA_TEXT,
  composite,
  contrastRatio,
  relativeLuminance,
} from '../../src/lib/color/contrast';

/** What the browser reports about one element: its colour and the fills behind it, nearest first. */
interface Sample {
  label: string;
  color: string;
  /** Background colours from the element out, up to and including the first opaque one. */
  layers: string[];
  /** Set when a gradient or image is behind the element: no single colour to measure against. */
  skip?: string;
  isLarge: boolean;
}

/** A measured pair that fails its AA minimum. */
export interface ContrastFailure {
  label: string;
  ratio: number;
  minimum: number;
  foreground: string;
  background: string;
}

/** The opaque colour seen behind an element: its layers composited onto the first opaque one. */
function seenBackground(layers: string[]): string {
  const [opaque, ...rest] = [...layers].reverse();
  if (!opaque) throw new Error('No background behind the element');
  return rest.reduce((backdrop, layer) => composite(layer, backdrop), opaque);
}

function measure(sample: Sample, minimum: number): ContrastFailure | null {
  const background = seenBackground(sample.layers);
  const foreground = composite(sample.color, background);
  const ratio = contrastRatio(foreground, background);
  return ratio >= minimum
    ? null
    : { label: sample.label, ratio: Number(ratio.toFixed(2)), minimum, foreground, background };
}

/** Functions living in the page, passed into later `evaluate` calls. */
interface PageTools {
  /** Any CSS colour the browser computes (rgb, oklab from Tailwind's `/alpha`…) as `rgba()`. */
  rgba: (color: string) => string;
  /** The background colours behind an element, from it outwards, as `rgba()`. */
  layersOf: (element: Element) => Pick<Sample, 'layers' | 'skip'>;
}

function toolsInPage(page: Page): Promise<JSHandle<PageTools>> {
  return page.evaluateHandle(() => {
    const canvas = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    });
    if (!canvas) throw new Error('No 2D canvas to read colours with');
    // A canvas reads any colour syntax the browser computes and hands back plain sRGB.
    const rgba = (color: string) => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = color;
      canvas.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 255] = canvas.getImageData(0, 0, 1, 1).data;
      return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    };
    const layersOf = (element: Element) => {
      const layers: string[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none')
          return { layers, skip: 'a gradient or image behind it' };
        const color = rgba(style.backgroundColor);
        if (color.endsWith(', 0)')) continue;
        layers.push(color);
        if (color.endsWith(', 1)')) return { layers };
      }
      return { layers: [...layers, 'rgba(255, 255, 255, 1)'] };
    };
    return { rgba, layersOf };
  });
}

/**
 * Every visible piece of text on the page that should be read: not decorative (`aria-hidden`),
 * not disabled or faded out (WCAG exempts inactive controls), not visually hidden.
 */
async function textSamples(page: Page): Promise<Sample[]> {
  const tools = await toolsInPage(page);
  return page.evaluate(({ rgba, layersOf }) => {
    const samples: Sample[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const element = text.parentElement;
      if (!element || seen.has(element) || !text.textContent?.trim()) continue;
      seen.add(element);
      if (element.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"], option'))
        continue;
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      let isFaded = false;
      for (let node: Element | null = element; node; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 1) isFaded = true;
      }
      if (isFaded) continue;
      const style = getComputedStyle(element);
      const size = Number.parseFloat(style.fontSize);
      const weight = Number(style.fontWeight);
      samples.push({
        label: `"${text.textContent.trim().slice(0, 40)}" <${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}">`,
        color: rgba(style.color),
        isLarge: size >= 24 || (size >= 18.66 && weight >= 700),
        ...layersOf(element),
      });
    }
    return samples;
  }, tools);
}

/** The text on the page that fails AA (4.5:1, or 3:1 for large text), and what was skipped. */
export async function textContrastFailures(
  page: Page,
): Promise<{ failures: ContrastFailure[]; measured: number; skipped: string[] }> {
  const samples = await textSamples(page);
  const skipped = samples.filter((s) => s.skip).map((s) => `${s.label}: ${s.skip}`);
  const failures = samples
    .filter((s) => !s.skip)
    .map((s) => measure(s, s.isLarge ? AA_NON_TEXT : AA_TEXT))
    .filter((failure): failure is ContrastFailure => failure !== null);
  return { failures, measured: samples.length - skipped.length, skipped };
}

/**
 * The keyboard-focused element's outline against what is behind it: the outline sits outside
 * the element (offset), so it is measured against its parent's background.
 */
export async function focusOutline(
  target: Locator,
): Promise<{ isFocusVisible: boolean; outline: string; failure: ContrastFailure | null }> {
  const tools = await toolsInPage(target.page());
  const sample = await target.evaluate((element, { rgba, layersOf }) => {
    const style = getComputedStyle(element);
    return {
      isFocusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      sample: {
        label: `focus outline of <${element.tagName.toLowerCase()}>`,
        color: rgba(style.outlineColor),
        isLarge: false,
        ...layersOf(element.parentElement ?? document.body),
      },
    };
  }, tools);
  if (sample.sample.skip) throw new Error(`${sample.sample.label}: ${sample.sample.skip}`);
  return {
    isFocusVisible: sample.isFocusVisible && sample.outlineStyle !== 'none',
    outline: sample.sample.color,
    failure: measure(sample.sample, AA_NON_TEXT),
  };
}

/** The page's own background and text colour, and the colour scheme it declares. */
export async function pageColours(
  page: Page,
): Promise<{ background: number; text: number; colorScheme: string }> {
  const computed = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  return {
    background: relativeLuminance(computed.background),
    text: relativeLuminance(computed.text),
    colorScheme: computed.colorScheme,
  };
}
