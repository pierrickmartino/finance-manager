import { describe, expect, it } from 'vitest';
import { figureSparkline } from './figure-sparkline';

/** A Key figure's sparkline, drawn in a 100 × 100 box (ticket #230). */

const point = (value: number, isPartial = false) => ({ label: `${value}`, value, isPartial });

describe("a Key figure's sparkline", () => {
  it('draws the settled intervals solid and the partial one as a dashed last segment', () => {
    const shape = figureSparkline([point(0), point(50), point(100, true)])!;

    // Fitted between its own low (at the foot, less padding) and high (at the top).
    expect(shape.solid).toBe('M0,90 L50,50');
    expect(shape.partial).toBe('M50,50 L100,10');
    expect(shape.area).toBe('M0,90 L50,50 L100,10 L100,100 L0,100 Z');
    expect(shape.last).toEqual({ x: 100, y: 10, isPartial: true });
  });

  it('draws the whole line solid when no interval is partial', () => {
    const shape = figureSparkline([point(0), point(50), point(100)])!;

    expect(shape.solid).toBe('M0,90 L50,50 L100,10');
    expect(shape.partial).toBeNull();
    expect(shape.last.isPartial).toBe(false);
  });

  it("sets a Period's cut-short first interval apart too: its first segment dashed", () => {
    const shape = figureSparkline([
      point(0, true),
      point(25),
      point(50),
      point(75),
      point(100, true),
    ])!;

    expect(shape.solid).toBe('M25,70 L50,50 L75,30');
    expect(shape.partial).toBe('M0,90 L25,70 M75,30 L100,10');
  });

  it('draws no solid line when both of only two intervals are partial', () => {
    const shape = figureSparkline([point(0, true), point(100, true)])!;

    expect(shape.solid).toBe('');
    expect(shape.partial).toBe('M0,90 L100,10');
  });

  it('fits a line that crosses zero inside the box, lowest loss at the foot', () => {
    const shape = figureSparkline([point(-200), point(600), point(200, true)])!;

    expect(shape.solid).toBe('M0,90 L50,10');
    expect(shape.partial).toBe('M50,10 L100,50');
  });

  it('draws nothing from fewer than two points', () => {
    expect(figureSparkline([point(100, true)])).toBeNull();
    expect(figureSparkline([])).toBeNull();
  });
});

describe("a Key figure's smooth sparkline", () => {
  /** The ends of every segment of a path, in order: its first point and each curve's end. */
  const endsOf = (path: string) =>
    [...path.matchAll(/(?:M|C[^C]*?\s)(-?[\d.]+),(-?[\d.]+)(?=\s*(?:C|M|$))/g)].map(
      ([, x, y]) => `${Number(x)},${Number(y)}`,
    );

  it('curves through the same points as the straight line, ending at the same dot', () => {
    const straight = figureSparkline([point(0), point(50), point(100, true)])!;
    const smooth = figureSparkline([point(0), point(50), point(100, true)], { isSmooth: true })!;

    expect(smooth.solid).toMatch(/^M0,90 C/);
    expect(smooth.solid).not.toContain('L');
    expect(endsOf(smooth.solid)).toEqual(['0,90', '50,50']);
    expect(endsOf(smooth.partial!)).toEqual(['50,50', '100,10']);
    expect(smooth.last).toEqual(straight.last);
  });

  it('keeps the dashed segments apart at both ends, as the straight line does', () => {
    const smooth = figureSparkline(
      [point(0, true), point(25), point(50), point(75), point(100, true)],
      { isSmooth: true },
    )!;

    expect(endsOf(smooth.solid)).toEqual(['25,70', '50,50', '75,30']);
    expect(smooth.partial!.match(/M/g)).toHaveLength(2);
    expect(endsOf(smooth.partial!)).toEqual(['0,90', '25,70', '75,30', '100,10']);
  });

  it('never overshoots a peak or a trough: a curve stays between its two points', () => {
    const smooth = figureSparkline([point(0), point(100), point(0), point(100)], {
      isSmooth: true,
    })!;
    const curves = [...smooth.solid.matchAll(/C([^C]+)/g)].map(([, body]) =>
      body!
        .trim()
        .split(/\s+/)
        .map((pair) => Number(pair.split(',')[1])),
    );

    for (const ys of curves) {
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(10);
        expect(y).toBeLessThanOrEqual(90);
      }
    }
  });

  it('fills under the curve, closed down to the foot', () => {
    const smooth = figureSparkline([point(0), point(50), point(100)], { isSmooth: true })!;

    expect(smooth.area).toMatch(/^M0,90 C.* L100,100 L0,100 Z$/);
    expect(smooth.area).toContain(smooth.solid.slice(1));
  });
});
