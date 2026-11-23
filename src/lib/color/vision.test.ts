import { describe, expect, it } from 'vitest';
import { ciede2000, deltaE, simulate, toLab } from './vision';

describe('ciede2000', () => {
  // Sharma, Wu & Dalal (2005), "The CIEDE2000 color-difference formula", test data pairs 1, 7, 17, 25.
  it.each([
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: 0, b: 0 }, { L: 50, a: -1, b: 2 }, 2.3669],
    [{ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 }, 27.1492],
    [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
  ])('matches the published value for %o and %o', (first, second, expected) => {
    expect(ciede2000(first, second)).toBeCloseTo(expected, 4);
    expect(ciede2000(second, first)).toBeCloseTo(expected, 4);
  });
});

describe('toLab', () => {
  it('puts sRGB white at L 100 with no colour, and pure red where CIELAB (D65) has it', () => {
    const white = toLab('#ffffff');
    expect(white.L).toBeCloseTo(100, 1);
    expect(white.a).toBeCloseTo(0, 1);
    expect(white.b).toBeCloseTo(0, 1);
    const red = toLab('#ff0000');
    expect(red.L).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
  });
});

describe('deltaE', () => {
  it('is 0 for a colour and itself, and 100 for black and white', () => {
    expect(deltaE('#3a7bd5', '#3a7bd5')).toBeCloseTo(0, 5);
    expect(deltaE('#000000', '#ffffff')).toBeCloseTo(100, 1);
  });
});

describe('simulate', () => {
  for (const deficiency of ['protan', 'deutan', 'tritan'] as const) {
    it(`leaves greys grey under ${deficiency} vision`, () => {
      for (const grey of ['#000000', '#808080', '#ffffff']) {
        expect(deltaE(simulate(grey, deficiency), grey)).toBeLessThan(1);
      }
    });
  }

  it('collapses the classic confusions: red against green for protan and deutan, blue against green for tritan', () => {
    // Clearly apart to normal vision...
    expect(deltaE('#e0301e', '#5f8a00')).toBeGreaterThan(40);
    expect(deltaE('#3b82f6', '#22c55e')).toBeGreaterThan(40);
    // ...and much closer once simulated.
    for (const deficiency of ['protan', 'deutan'] as const) {
      expect(deltaE(simulate('#e0301e', deficiency), simulate('#5f8a00', deficiency))).toBeLessThan(
        deltaE('#e0301e', '#5f8a00') / 2,
      );
    }
    expect(deltaE(simulate('#3b82f6', 'tritan'), simulate('#22c55e', 'tritan'))).toBeLessThan(
      deltaE('#3b82f6', '#22c55e') / 2,
    );
  });

  it('keeps blue against yellow apart for protan and deutan (the axis they still see)', () => {
    for (const deficiency of ['protan', 'deutan'] as const) {
      expect(
        deltaE(simulate('#2563eb', deficiency), simulate('#facc15', deficiency)),
      ).toBeGreaterThan(40);
    }
  });
});
