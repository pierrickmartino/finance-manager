import { describe, expect, it } from 'vitest';
import { pathThrough } from './smooth-path';

/** A path's curves, each as its two control points and its end: [[x, y], [x, y], [x, y]]. */
const curvesOf = (path: string) =>
  [...path.matchAll(/C([^CML]+)/g)].map(([, body]) =>
    body!
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(',').map(Number) as [number, number]),
  );

describe('a path through spots', () => {
  const spots = [
    { x: 0, y: 90 },
    { x: 50, y: 50 },
    { x: 100, y: 10 },
  ];

  it('joins them straight unless asked to curve', () => {
    expect(pathThrough(spots, 0, 2)).toBe('M0,90 L50,50 L100,10');
  });

  it('curves through every spot, from the first to the last asked for', () => {
    const path = pathThrough(spots, 0, 2, { isSmooth: true });

    expect(path).toMatch(/^M0,90 C/);
    expect(path).not.toContain('L');
    expect(curvesOf(path).map((curve) => curve[2])).toEqual([
      [50, 50],
      [100, 10],
    ]);
  });

  it('draws a stretch of the same curve, so its pieces meet without a kink', () => {
    const whole = pathThrough(spots, 0, 2, { isSmooth: true });
    const first = pathThrough(spots, 0, 1, { isSmooth: true });
    const second = pathThrough(spots, 1, 2, { isSmooth: true });

    expect(`${first} ${second.replace('M50,50 ', '')}`).toBe(whole);
  });

  it('is empty when the stretch holds no segment', () => {
    expect(pathThrough(spots, 1, 1, { isSmooth: true })).toBe('');
    expect(pathThrough(spots, 2, 1)).toBe('');
  });

  it('never overshoots: each curve stays between its two spots, however unevenly spaced', () => {
    const zigzag = [
      { x: 0, y: 90 },
      { x: 5, y: 10 },
      { x: 60, y: 90 },
      { x: 70, y: 10 },
      { x: 100, y: 50 },
    ];
    const curves = curvesOf(pathThrough(zigzag, 0, 4, { isSmooth: true }));

    curves.forEach((curve, i) => {
      const [low, high] = [zigzag[i]!.y, zigzag[i + 1]!.y].sort((a, b) => a - b);
      for (const [, y] of curve) {
        expect(y).toBeGreaterThanOrEqual(low!);
        expect(y).toBeLessThanOrEqual(high!);
      }
    });
  });

  it('runs flat through a level stretch, as a running total that stops growing', () => {
    const level = [
      { x: 0, y: 90 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ];
    const [, flat] = curvesOf(pathThrough(level, 0, 2, { isSmooth: true }));

    expect(flat!.map(([, y]) => y)).toEqual([50, 50, 50]);
  });
});
