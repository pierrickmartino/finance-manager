import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAT_HUE, HEAT_LEVELS, HEAT_PARTIAL_OUTLINE } from '@/lib/reporting/heatmap';
import {
  AA_NON_TEXT,
  AA_TEXT,
  composite,
  contrastRatio,
  mixSrgb,
  relativeLuminance,
} from './contrast';
import { TEXT_ON_RAMP_FILLS, type RampFill, type RampStop } from './ramp-fills';

/*
 * The colour data itself (spec #239, ADR-0017): every token text pair passes AA. The values are
 * read from the app's stylesheet, the tokens' one home, so a change there is what is checked.
 */

const css = readFileSync(path.join(import.meta.dirname, '../../app/globals.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`No --color-${name} hex value in globals.css`);
  return match[1];
}

function expectPair(text: string, background: string, minimum = AA_TEXT) {
  const ratio = contrastRatio(token(text), token(background));
  expect(ratio, `${text} on ${background}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
}

describe('the tokens are dark', () => {
  it('has a deep page and light text', () => {
    expect(relativeLuminance(token('paper'))).toBeLessThan(0.02);
    expect(relativeLuminance(token('ink'))).toBeGreaterThan(0.7);
  });

  it('declares a dark colour scheme, so native controls and scrollbars are dark', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark;/);
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

  for (const tone of ['positive', 'negative', 'warning', 'info']) {
    it(`${tone} on its tint (badges, notices)`, () => expectPair(tone, `${tone}-tint`));
  }

  it('the bar text on the page', () => expectPair('on-ramp', 'paper'));
});

describe('buttons', () => {
  it('the primary button: navy text on its near-white fill, and on its hover', () => {
    expect(relativeLuminance(token('ink'))).toBeGreaterThan(0.7);
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

/** A `@utility` whose background is `color-mix(in srgb, var(--color-a) N%, var(--color-b))`. */
function mixedUtility(name: string): string {
  const match = new RegExp(
    `@utility ${name} \\{\\s*background-color: color-mix\\(in srgb, var\\(--color-([\\w-]+)\\) (\\d+)%, var\\(--color-([\\w-]+)\\)\\);`,
  ).exec(css);
  if (!match) throw new Error(`No flat color-mix @utility ${name} in globals.css`);
  const [, a, share, b] = match;
  return mixSrgb(token(a!), token(b!), Number(share) / 100);
}

describe('white text on the deep steps of the ramp', () => {
  const cases = [
    ['bg-insight', 0.6], // the insight card's faintest words: its bars' labels
    ['bg-spotlight', 0.75], // Recent activity's spotlight caption
    ['bg-spotlight-strong', 0.75], // …on hover
  ] as const;
  for (const [utility, alpha] of cases) {
    it(`on-ramp/${alpha * 100} on ${utility}`, () => {
      const background = mixedUtility(utility);
      const text = composite(`rgba(255, 255, 255, ${alpha})`, background);
      expect(relativeLuminance(token('on-ramp'))).toBe(1);
      const ratio = contrastRatio(text, background);
      expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
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
