import { describe, expect, it } from 'vitest';
import { figureSparkline } from './figure-sparkline';

/** A Key figure's sparkline, drawn in a 100 × 100 box (ticket #230). */

const point = (value: number, isPartial = false) => ({ label: `${value}`, value, isPartial });

describe("a Key figure's sparkline", () => {
  it('draws the settled periods solid and the partial one as a dashed last segment', () => {
    const shape = figureSparkline([point(0), point(50), point(100, true)])!;

    // Fitted between its own low (at the foot, less padding) and high (at the top).
    expect(shape.solid).toBe('M0,90 L50,50');
    expect(shape.partial).toBe('M50,50 L100,10');
    expect(shape.area).toBe('M0,90 L50,50 L100,10 L100,100 L0,100 Z');
    expect(shape.last).toEqual({ x: 100, y: 10, isPartial: true });
  });

  it('draws the whole line solid when no period is partial', () => {
    const shape = figureSparkline([point(0), point(50), point(100)])!;

    expect(shape.solid).toBe('M0,90 L50,50 L100,10');
    expect(shape.partial).toBeNull();
    expect(shape.last.isPartial).toBe(false);
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
