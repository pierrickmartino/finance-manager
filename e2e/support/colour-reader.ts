/**
 * Reading the colours the browser computes (spec #239), shared by the contrast and glass
 * helpers: a 2D canvas takes any colour syntax the browser produces (rgb, oklab from Tailwind's
 * `/alpha`, color-mix…) and hands back plain sRGB, so every helper reads colours the same way.
 */
import type { JSHandle, Page } from '@playwright/test';

/** Functions living in the page, passed into later `evaluate` calls. */
export interface ColourReader {
  /** Any CSS colour, as `rgba(r, g, b, a)` with `a` from 0 to 1. */
  rgba: (color: string) => string;
  /** Any CSS colour's opacity: 0 is transparent, 1 opaque. */
  alpha: (color: string) => number;
}

export function colourReader(page: Page): Promise<JSHandle<ColourReader>> {
  return page.evaluateHandle(() => {
    const canvas = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    });
    if (!canvas) throw new Error('No 2D canvas to read colours with');
    const read = (color: string) => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = color;
      canvas.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = canvas.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    return {
      rgba: (color: string) => {
        const { r, g, b, a } = read(color);
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      },
      alpha: (color: string) => read(color).a,
    };
  });
}
