import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_PALETTE } from '@/app/dashboards/chart-palette';
import { AA_NON_TEXT, AA_TEXT, contrastRatio, relativeLuminance } from './contrast';
import { type Deficiency, deltaE, simulate } from './vision';

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

describe('the focus outline', () => {
  for (const background of ['paper', 'surface', 'sunken', 'accent-tint']) {
    it(`accent-ink is visible on ${background}`, () =>
      expectPair('accent-ink', background, AA_NON_TEXT));
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

  it('draws chart text, gridlines and the surface in the dark muted, rule and surface tokens', () => {
    expect(CHART_PALETTE.text.toLowerCase()).toBe(token('muted').toLowerCase());
    expect(CHART_PALETTE.grid.toLowerCase()).toBe(token('rule').toLowerCase());
    expect(CHART_PALETTE.surface.toLowerCase()).toBe(token('surface').toLowerCase());
  });
});
