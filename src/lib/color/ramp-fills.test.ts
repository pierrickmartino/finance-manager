import { describe, expect, it } from 'vitest';
import { cssGradient, RAMP_FILLS, TEXT_ON_RAMP_FILLS, type RampFill } from './ramp-fills';

describe('cssGradient', () => {
  it('writes each stop as its token mixed to its alpha, at its place along the gradient', () => {
    const fill: RampFill = {
      direction: 'down',
      stops: [
        { token: 'ramp-1', alpha: 0.45, at: 0 },
        { token: 'ramp-5', alpha: 0.08, at: 1 },
      ],
    };

    expect(cssGradient(fill)).toBe(
      'linear-gradient(to bottom, ' +
        'color-mix(in srgb, var(--color-ramp-1) 45%, transparent) 0%, ' +
        'color-mix(in srgb, var(--color-ramp-5) 8%, transparent) 100%)',
    );
  });

  it.each([
    ['down', 'to bottom'],
    ['up', 'to top'],
    ['down-right', 'to bottom right'],
  ] as const)('runs a %s fill %s', (direction, css) => {
    const fill: RampFill = { direction, stops: [{ token: 'ramp-3', alpha: 1, at: 0.5 }] };

    expect(cssGradient(fill)).toBe(
      `linear-gradient(${css}, color-mix(in srgb, var(--color-ramp-3) 100%, transparent) 50%)`,
    );
  });
});

describe('TEXT_ON_RAMP_FILLS', () => {
  it('lists the Net worth tile with every text written on it, measured on the fill itself', () => {
    const tile = TEXT_ON_RAMP_FILLS.find((entry) => entry.fill === RAMP_FILLS.netWorthTile);

    expect(tile?.plate).toBeUndefined();
    expect(tile?.texts).toEqual(['ink', 'muted', 'positive', 'negative', 'warning']);
  });

  it("lists the Net worth plot's value label on each band, read against its ink plate", () => {
    const bands = [RAMP_FILLS.currentBand, RAMP_FILLS.savingsBand, RAMP_FILLS.pillarBand];

    for (const band of bands) {
      const label = TEXT_ON_RAMP_FILLS.find((entry) => entry.fill === band);
      expect(label).toMatchObject({ plate: 'ink', texts: ['paper'] });
    }
  });

  it('lists only gradients a text sits on: none for the sparkline or the trend bars', () => {
    const listed = TEXT_ON_RAMP_FILLS.map((entry) => entry.fill);

    expect(listed).not.toContain(RAMP_FILLS.sparkline);
    expect(listed).not.toContain(RAMP_FILLS.trendBar);
    expect(listed).toHaveLength(4);
  });
});
