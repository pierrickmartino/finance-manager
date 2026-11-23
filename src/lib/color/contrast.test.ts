import { describe, expect, it } from 'vitest';
import { contrastRatio, mixSrgb, parseColor } from './contrast';

describe('contrastRatio', () => {
  it('is 21:1 for black on white, whichever way round', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1:1 for a colour on itself', () => {
    expect(contrastRatio('#3a7bd5', '#3a7bd5')).toBeCloseTo(1, 5);
  });

  it('matches the WCAG worked values for greys on white', () => {
    // #767676 is the classic lightest grey that passes AA on white; #777777 just fails.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('parseColor', () => {
  it('reads hex and the rgb()/rgba() a browser computes', () => {
    expect(parseColor('#0a1022')).toEqual({ r: 10, g: 16, b: 34, a: 1 });
    expect(parseColor('#FFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('rgb(12, 34, 56)')).toEqual({ r: 12, g: 34, b: 56, a: 1 });
    expect(parseColor('rgba(12, 34, 56, 0.5)')).toEqual({ r: 12, g: 34, b: 56, a: 0.5 });
  });

  it('rejects anything else', () => {
    expect(() => parseColor('cyan')).toThrow();
  });
});

describe('mixSrgb', () => {
  it('blends like color-mix(in srgb): the share of the first colour over the second', () => {
    expect(mixSrgb('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mixSrgb('#ff0000', '#0000ff', 1)).toBe('#ff0000');
    expect(mixSrgb('#ff0000', '#0000ff', 0)).toBe('#0000ff');
  });
});
