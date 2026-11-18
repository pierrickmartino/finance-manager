import { describe, expect, it } from 'vitest';
import type { AccountKind } from '@/server/services/accounts/input';
import type { NetWorthBand } from './net-worth-card';
import { alongLine, bandPath, scaleOf, stackBands } from './net-worth-chart';
import type { PeriodValue } from './period-values';

const point = (value: number): PeriodValue => ({ label: '', value, href: '', isPartial: false });

const band = (key: AccountKind, values: number[]): NetWorthBand => ({
  key,
  label: key,
  points: values.map(point),
});

describe('stackBands', () => {
  it('stacks positive bands up from zero and negative ones down from it', () => {
    const spans = stackBands([
      band('current', [100, 200]),
      band('loan', [-50, -80]),
      band('savings', [30, 0]),
    ]);

    expect(spans).toEqual([
      [
        { low: 0, high: 100 },
        { low: 0, high: 200 },
      ],
      [
        { low: -50, high: 0 },
        { low: -80, high: 0 },
      ],
      [
        { low: 100, high: 130 },
        { low: 200, high: 200 },
      ],
    ]);
  });

  it('stacks a second negative band under the first', () => {
    const spans = stackBands([band('loan', [-50]), band('current', [-20])]);

    expect(spans[1]).toEqual([{ low: -70, high: -50 }]);
  });

  it('has no spans without bands', () => {
    expect(stackBands([])).toEqual([]);
  });
});

describe('scaleOf', () => {
  it('spreads the points across and fits the values and zero top to bottom', () => {
    const scale = scaleOf(3, [-100, 300]);

    expect([scale.x(0), scale.x(1), scale.x(2)]).toEqual([0, 50, 100]);
    expect([scale.y(300), scale.y(0), scale.y(-100)]).toEqual([0, 75, 100]);
  });

  it('centres a single point and keeps a flat zero line in the box', () => {
    const scale = scaleOf(1, [0]);

    expect(scale.x(0)).toBe(50);
    expect(scale.y(0)).toBe(100);
  });
});

describe('bandPath', () => {
  const scale = scaleOf(2, [0, 100]);
  const spans = [
    { low: 0, high: 50 },
    { low: 0, high: 100 },
  ];

  it('runs along the top edge and back along the bottom', () => {
    expect(bandPath(spans, false, scale)).toBe('M0,50 L100,0 L100,100 L0,100 Z');
  });

  it('holds a stepped band flat until the next point, then steps', () => {
    expect(bandPath(spans, true, scale)).toBe('M0,50 L100,50 L100,0 L100,100 L100,100 L0,100 Z');
  });
});

describe('alongLine', () => {
  const points = [point(0), point(100), point(300)];
  const scale = scaleOf(3, [0, 100, 300]);

  it('places a marker between the points either side of it', () => {
    // Halfway from 100 (x 50) to 300 (x 100): 200, a third of the way down.
    const spot = alongLine(points, 1.5, scale);

    expect(spot.x).toBe(75);
    expect(spot.y).toBeCloseTo(100 / 3);
  });

  it('places a marker at the last point on it', () => {
    expect(alongLine(points, 2, scale)).toEqual({ x: 100, y: 0 });
  });
});
