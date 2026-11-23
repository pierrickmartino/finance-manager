import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_TEXT, contrastRatio, relativeLuminance } from './contrast';

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
