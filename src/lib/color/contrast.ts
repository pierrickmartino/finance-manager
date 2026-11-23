/**
 * WCAG 2 contrast, by hand (no dependency): the colour data's AA checks (design-tokens.test.ts)
 * and the design-system browser spec measure with it. Colours are `#rgb`, `#rrggbb` or the
 * `rgb()` / `rgba()` strings a browser computes.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0–1. */
  a: number;
}

/** AA for body text. */
export const AA_TEXT = 4.5;
/** AA for large text and for non-text marks such as a focus outline (WCAG 1.4.11). */
export const AA_NON_TEXT = 3;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;

export function parseColor(color: string): Rgba {
  const value = color.trim();
  const hex = HEX.exec(value)?.[1];
  if (hex) {
    const digits = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = RGB.exec(value);
  if (rgb) {
    const alpha = rgb[4];
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a:
        alpha === undefined
          ? 1
          : alpha.endsWith('%')
            ? Number(alpha.slice(0, -1)) / 100
            : Number(alpha),
    };
  }
  throw new Error(`Not a colour this helper reads: ${color}`);
}

function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an opaque colour (alpha is ignored: composite first). */
export function relativeLuminance(color: string): number {
  const { r, g, b } = parseColor(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio of two opaque colours, 1–21, in either order. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `color-mix(in srgb, a share, b)`: `share` (0–1) of `a` over the rest in `b`, as `#rrggbb`. */
export function mixSrgb(a: string, b: string, share: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const blend = (p: number, q: number) => p * share + q * (1 - share);
  return toHex({ r: blend(x.r, y.r), g: blend(x.g, y.g), b: blend(x.b, y.b), a: 1 });
}

/** A possibly translucent colour laid over an opaque backdrop, as the opaque colour seen. */
export function composite(color: string, backdrop: string): string {
  return mixSrgb(color, backdrop, parseColor(color).a);
}
