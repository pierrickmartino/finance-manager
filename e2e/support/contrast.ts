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
import { colourReader, type ColourReader } from './colour-reader';

/** What the browser reports about one element: its colour and the fills behind it, nearest first. */
interface Sample {
  label: string;
  color: string;
  /** Background colours from the element out, up to and including the first opaque one. */
  layers: string[];
  /**
   * Whether a gradient or image is drawn behind it (the Net worth tile's ramp fill). The text is
   * then measured on the fills beneath the image: under reduced transparency, the opaque
   * fallback surface. The gradient itself is checked at every step by `design-tokens.test.ts`
   * (`TEXT_ON_RAMP_FILLS`).
   */
  isOverImage: boolean;
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
interface PageTools extends ColourReader {
  /** The background colours behind an element, from it outwards, as `rgba()`. */
  layersOf: (element: Element) => Pick<Sample, 'layers' | 'isOverImage'>;
}

async function toolsInPage(page: Page): Promise<JSHandle<PageTools>> {
  const reader = await colourReader(page);
  return page.evaluateHandle((reader) => {
    const layersOf = (element: Element) => {
      const layers: string[] = [];
      let isOverImage = false;
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none') isOverImage = true;
        const alpha = reader.alpha(style.backgroundColor);
        if (alpha === 0) continue;
        layers.push(reader.rgba(style.backgroundColor));
        if (alpha === 1) return { layers, isOverImage };
      }
      // The page always has an opaque fill (`body`): reaching here is a page drawn without one.
      throw new Error(`No opaque background behind <${element.tagName.toLowerCase()}>`);
    };
    return { rgba: reader.rgba, alpha: reader.alpha, layersOf };
  }, reader);
}

/** The font size (px) from which text counts as large for AA, and the size that does when bold. */
const LARGE_TEXT_PX = 24;
const LARGE_BOLD_TEXT_PX = 18.66;
const BOLD_WEIGHT = 700;

/**
 * Every visible piece of text on the page that should be read: not decorative (`aria-hidden`),
 * not disabled or faded out (WCAG exempts inactive controls), not visually hidden.
 */
async function textSamples(page: Page): Promise<Sample[]> {
  const tools = await toolsInPage(page);
  return page.evaluate(
    ({ tools: { rgba, layersOf }, large }) => {
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
        const label = `"${text.textContent.trim().slice(0, 40)}" <${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}">`;
        samples.push({
          label,
          color: rgba(style.color),
          isLarge: size >= large.size || (size >= large.boldSize && weight >= large.bold),
          ...layersOf(element),
        });
      }
      return samples;
    },
    {
      tools,
      large: { size: LARGE_TEXT_PX, boldSize: LARGE_BOLD_TEXT_PX, bold: BOLD_WEIGHT },
    },
  );
}

/**
 * The text on the page that fails AA (4.5:1, or 3:1 for large text), how many pieces were
 * measured, and the labels of those measured over a gradient (see `Sample.isOverImage`).
 */
export async function textContrastFailures(
  page: Page,
): Promise<{ failures: ContrastFailure[]; measured: number; overImage: string[] }> {
  const samples = await textSamples(page);
  const failures = samples
    .map((s) => measure(s, s.isLarge ? AA_NON_TEXT : AA_TEXT))
    .filter((failure): failure is ContrastFailure => failure !== null);
  const overImage = samples.filter((s) => s.isOverImage).map((s) => s.label);
  return { failures, measured: samples.length, overImage };
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

/** An element's computed text colour, as `rgba()`. */
export async function textColour(target: Locator): Promise<string> {
  const reader = await colourReader(target.page());
  return target.evaluate((element, reader) => reader.rgba(getComputedStyle(element).color), reader);
}

/** A colour token's value as the page computes it (`--color-<name>`), as `rgba()`. */
export async function tokenColour(page: Page, name: string): Promise<string> {
  const reader = await colourReader(page);
  return page.evaluate(
    ({ reader, name }) =>
      reader.rgba(getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`)),
    { reader, name },
  );
}
