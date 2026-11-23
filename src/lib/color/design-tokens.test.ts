import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_PALETTE } from '@/app/dashboards/chart-palette';
import { HEAT_HUE, HEAT_LEVELS, HEAT_PARTIAL_OUTLINE } from '@/lib/reporting/heatmap';
import {
  AA_NON_TEXT,
  AA_TEXT,
  composite,
  contrastRatio,
  mixSrgb,
  parseColor,
  relativeLuminance,
} from './contrast';
import { TEXT_ON_RAMP_FILLS, type RampFill, type RampStop } from './ramp-fills';
import { type Deficiency, deltaE, simulate } from './vision';

/*
 * The colour data itself (spec #239, ADR-0017): every token text pair passes AA. The values are
 * read from the app's stylesheet, the tokens' one home, so a change there is what is checked.
 */

const css = readFileSync(path.join(import.meta.dirname, '../../app/globals.css'), 'utf8');

/** A token's colour: its hex value, or the token it names (`var(--color-paper)`), resolved. */
function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`No --color-${name} in globals.css`);
  const value = match[1].trim();
  if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return value;
  const reference = /^var\(--color-([\w-]+)\)$/.exec(value);
  if (reference?.[1]) return token(reference[1]);
  const mix = MIX.exec(value);
  if (mix) return mixed(mix);
  throw new Error(`--color-${name} is neither a hex value, a token nor a flat mix: ${value}`);
}

/** `color-mix(in srgb, var(--color-a) N%, var(--color-b))`: a flat mix of two tokens. */
const MIX = /^color-mix\(in srgb, var\(--color-([\w-]+)\) (\d+)%, var\(--color-([\w-]+)\)\)$/;

function mixed([, a, share, b]: RegExpExecArray): string {
  return mixSrgb(token(a!), token(b!), Number(share) / 100);
}

/** The relative luminance under which a colour reads as deep: the page. */
const DEEP = 0.02;
/** The relative luminance over which a colour reads as light: the text. */
const LIGHT = 0.7;

function expectPair(text: string, background: string, minimum = AA_TEXT) {
  const ratio = contrastRatio(token(text), token(background));
  expect(ratio, `${text} on ${background}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
}

describe('the tokens are dark', () => {
  it('has a deep page and light text', () => {
    expect(relativeLuminance(token('paper'))).toBeLessThan(DEEP);
    expect(relativeLuminance(token('ink'))).toBeGreaterThan(LIGHT);
  });
});

describe('text passes AA on the backgrounds it sits on', () => {
  const backgrounds = ['paper', 'surface', 'sunken'];

  for (const text of ['ink', 'ink-soft', 'muted']) {
    for (const background of backgrounds) {
      it(`${text} on ${background}`, () => expectPair(text, background));
    }
  }

  for (const text of ['accent-ink', 'positive', 'negative', 'warning', 'info']) {
    it(`${text} on surface`, () => expectPair(text, 'surface'));
  }

  it('ink and accent-ink on accent-tint (selected navigation, highlighted rows)', () => {
    expectPair('ink', 'accent-tint');
    expectPair('accent-ink', 'accent-tint');
  });

  it('negative and warning on accent-tint (a highlighted row: Profit and loss Net cash flow)', () => {
    expectPair('negative', 'accent-tint');
    expectPair('warning', 'accent-tint');
  });

  for (const tone of ['positive', 'negative', 'warning', 'info']) {
    it(`${tone} on its tint (badges, notices)`, () => expectPair(tone, `${tone}-tint`));
  }

  it('the bar text on the page', () => expectPair('on-ramp', 'paper'));
});

describe('buttons', () => {
  it('the primary button: navy text on its near-white fill, and on its hover', () => {
    expect(relativeLuminance(token('ink'))).toBeGreaterThan(LIGHT);
    expectPair('paper', 'ink');
    expectPair('paper', 'ink-hover');
  });

  it('the accent button: navy text on its cyan fill', () => {
    expectPair('paper', 'accent-ink');
  });

  it('text on an ink fill (selected list items, the current Dashboard tab)', () => {
    expectPair('on-ink', 'ink');
  });
});

describe('the heatmap', () => {
  HEAT_LEVELS.forEach((level, i) => {
    it(`level ${i + 1}'s number passes AA on its shade (${level.mix}% of ${HEAT_HUE})`, () => {
      const shade = mixSrgb(token(HEAT_HUE), token('surface'), level.mix / 100);
      const ratio = contrastRatio(token(level.text), shade);
      expect(ratio, `${level.text} on ${shade}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });
  });

  // Drawn just outside the cell, so on the card or a group's subtotal band.
  for (const background of ['surface', 'sunken']) {
    it(`the running period's outline is visible on ${background}`, () =>
      expectPair(HEAT_PARTIAL_OUTLINE, background, AA_NON_TEXT));
  }

  it('the shades step up from the card: the largest is the brightest', () => {
    const luminances = HEAT_LEVELS.map((level) =>
      relativeLuminance(mixSrgb(token(HEAT_HUE), token('surface'), level.mix / 100)),
    );
    expect(luminances).toEqual([...luminances].sort((a, b) => a - b));
    expect(luminances[0]).toBeGreaterThan(relativeLuminance(token('surface')));
  });
});

/** A `@utility` whose background is a flat mix of two tokens (see MIX). */
function mixedUtility(name: string): string {
  const match = new RegExp(`@utility ${name} \\{\\s*background-color: ([^;]+);`).exec(css);
  const mix = match?.[1] ? MIX.exec(match[1]) : null;
  if (!mix) throw new Error(`No flat color-mix @utility ${name} in globals.css`);
  return mixed(mix);
}

/** A hex colour at `alpha` opacity, as `rgba()`. */
function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** How much of a glass container's fill shows (`--glass-opacity` in globals.css), 0–1. */
const GLASS_OPACITY = (() => {
  const match = /--glass-opacity:\s*(\d+)%;/.exec(css);
  if (!match?.[1]) throw new Error('No --glass-opacity in globals.css');
  return Number(match[1]) / 100;
})();

describe('white text on the deep steps of the ramp', () => {
  const cases = [
    ['the insight tile', () => token('insight'), 0.6], // its faintest words: its bars' labels
    ['the spotlight', () => mixedUtility('bg-spotlight'), 0.75], // Recent activity's caption
    ['the spotlight on hover', () => mixedUtility('bg-spotlight-strong'), 0.75],
  ] as const;
  for (const [name, background, alpha] of cases) {
    it(`on-ramp/${alpha * 100} on ${name}`, () => {
      const text = composite(withAlpha(token('on-ramp'), alpha), background());
      const ratio = contrastRatio(text, background());
      expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  it('on-ramp/60 on the insight tile as glass over the page', () => {
    // The glass lets the page through: the tile seen is its fill composited onto `paper`.
    const glass = composite(withAlpha(token('insight'), GLASS_OPACITY), token('paper'));
    const ratio = contrastRatio(composite(withAlpha(token('on-ramp'), 0.6), glass), glass);
    expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('text over a ramp gradient passes AA at every step of it', () => {
  const card = () => token('surface');
  const seen = (stop: RampStop) => mixSrgb(token(stop.token), card(), stop.alpha);

  /** What a gradient shows at `at` (0–1 along it), laid over the card: stops blend in sRGB. */
  function seenAt(fill: RampFill, at: number): string {
    const next = fill.stops.findIndex((stop) => stop.at >= at);
    const to = fill.stops[next === -1 ? fill.stops.length - 1 : next]!;
    const from = fill.stops[Math.max(0, (next === -1 ? fill.stops.length : next) - 1)]!;
    const share = to.at === from.at ? 1 : (at - from.at) / (to.at - from.at);
    return mixSrgb(seen(to), seen(from), Math.min(1, Math.max(0, share)));
  }

  const SAMPLES = Array.from({ length: 21 }, (_, i) => i / 20);

  for (const { name, fill, plate, texts } of TEXT_ON_RAMP_FILLS) {
    for (const text of texts) {
      it(`${text} on ${name}`, () => {
        for (const at of SAMPLES) {
          // A label on an opaque plate reads against the plate, wherever it sits on the fill.
          const behind = plate ? token(plate) : seenAt(fill, at);
          const ratio = contrastRatio(token(text), behind);
          expect(ratio, `at ${at} on ${behind}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
            AA_TEXT,
          );
        }
      });
    }
  }
});

describe('the focus outline', () => {
  for (const background of ['paper', 'surface', 'sunken', 'accent-tint']) {
    it(`accent-ink is visible on ${background}`, () =>
      expectPair('accent-ink', background, AA_NON_TEXT));
  }
});

/** A chart colour that reads a token (`var(--color-muted)`), as the token's value. */
function resolveVar(color: string): string {
  const reference = /^var\(--color-([\w-]+)\)$/.exec(color);
  if (!reference?.[1]) throw new Error(`${color} does not read a token`);
  return token(reference[1]);
}

describe('the ramp is clearly not the accent', () => {
  /** CIEDE2000 distance under which a ramp step could pass for the accent. */
  const DISTINCT_FROM_ACCENT = 15;

  for (const step of ['ramp-1', 'ramp-2', 'ramp-3', 'ramp-4', 'ramp-5']) {
    for (const accent of ['accent', 'accent-ink']) {
      it(`${step} stands apart from ${accent}`, () => {
        const distance = deltaE(token(step), token(accent));
        expect(distance, `ΔE ${distance.toFixed(1)}`).toBeGreaterThanOrEqual(DISTINCT_FROM_ACCENT);
      });
    }
  }
});

describe('the categorical chart palette', () => {
  const { series } = CHART_PALETTE;
  /** The bar for neighbouring series: CIEDE2000 ΔE after a Machado 2009 simulation. */
  const CVD_DELTA_E = 8;
  // Neighbours are consecutive slots, and the last against the first: a Transaction's Split
  // lines repeat the order after the eighth.
  const neighbours = series.map((hue, slot) => [hue, series[(slot + 1) % series.length]!] as const);

  it('has eight hues, each different', () => {
    expect(new Set(series.map((hue) => hue.toLowerCase())).size).toBe(8);
  });

  for (const deficiency of ['protan', 'deutan', 'tritan'] satisfies Deficiency[]) {
    it(`keeps neighbouring series apart under simulated ${deficiency} vision`, () => {
      for (const [first, second] of neighbours) {
        const distance = deltaE(simulate(first, deficiency), simulate(second, deficiency));
        expect(
          distance,
          `${first} beside ${second}: ΔE ${distance.toFixed(1)}`,
        ).toBeGreaterThanOrEqual(CVD_DELTA_E);
      }
    });
  }

  it('shows every series hue against the surface (non-text contrast)', () => {
    for (const hue of series) {
      const ratio = contrastRatio(hue, token('surface'));
      expect(ratio, `${hue} on surface: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('is neither the ramp nor the accent, so a series never reads as a state', () => {
    const reserved = ['ramp-1', 'ramp-2', 'ramp-3', 'ramp-4', 'ramp-5', 'accent', 'accent-ink'].map(
      (name) => token(name).toLowerCase(),
    );
    for (const hue of series) expect(reserved).not.toContain(hue.toLowerCase());
  });

  it('writes chart text and gridlines so they show on the surface', () => {
    const surface = resolveVar(CHART_PALETTE.surface);
    expect(contrastRatio(resolveVar(CHART_PALETTE.text), surface)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(resolveVar(CHART_PALETTE.grid), surface)).toBeGreaterThan(1);
  });
});
