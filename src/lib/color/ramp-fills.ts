/**
 * The ramp's gradients (docs/design-system.md, "Charts"; ADR-0017): cyan → blue → violet, in
 * fills only. They fill the sparklines, the Net worth card's bands and the area under its line,
 * the trend cards' bars and the overview's Net worth tile. Never text, a line, a stroke or an
 * outline; never the heatmap (a stepped single hue) or a Capital diamond (the accent). They are
 * atmosphere and never mark a state: hatching, dashes and outlines still say "partial", and the
 * accent still marks the point.
 *
 * SVG marks draw them with `RampGradient` (src/components/ramp-gradient.tsx), HTML ones take
 * `cssGradient`. `design-tokens.test.ts` checks the text that sits on them (`TEXT_ON_RAMP_FILLS`).
 */

export type RampStep = 'ramp-1' | 'ramp-2' | 'ramp-3' | 'ramp-4' | 'ramp-5';

export interface RampStop {
  token: RampStep;
  /** 0–1: how much of the step shows over what is behind. */
  alpha: number;
  /** 0–1 along the gradient. */
  at: number;
}

export interface RampFill {
  /** Which way the gradient runs, across the mark's own box. */
  direction: 'down' | 'up' | 'down-right';
  stops: readonly RampStop[];
}

const stop = (token: RampStep, alpha: number, at: number): RampStop => ({ token, alpha, at });

export const RAMP_FILLS = {
  /** Under a sparkline's line: cyan at the line, fading through blue to violet at its foot. */
  sparkline: {
    direction: 'down',
    stops: [stop('ramp-1', 0.45, 0), stop('ramp-3', 0.25, 0.55), stop('ramp-5', 0.08, 1)],
  },
  /** Under the Net worth line, behind its bands: a glow wherever no band covers it. */
  netWorthArea: {
    direction: 'down',
    stops: [stop('ramp-1', 0.3, 0), stop('ramp-5', 0, 1)],
  },
  /**
   * The Net worth bands, each its own pair of neighbouring steps, lighter at the top. Where two
   * bands touch (current under savings, savings under 3a) their steps are two apart, so the
   * kinds stay distinct.
   */
  currentBand: { direction: 'down', stops: [stop('ramp-1', 0.9, 0), stop('ramp-2', 0.75, 1)] },
  savingsBand: { direction: 'down', stops: [stop('ramp-3', 0.9, 0), stop('ramp-4', 0.75, 1)] },
  pillarBand: { direction: 'down', stops: [stop('ramp-4', 0.9, 0), stop('ramp-5', 0.75, 1)] },
  /** A trend card's bars (all but the hatched one): violet at the foot, cyan at the top. */
  trendBar: {
    direction: 'up',
    stops: [stop('ramp-5', 0.5, 0), stop('ramp-3', 0.6, 0.5), stop('ramp-1', 0.7, 1)],
  },
  /**
   * The overview's "Your net worth today" tile: violet in its corner, fading to the card. Faint
   * enough that `muted` and `negative` written on it still pass AA in the corner.
   */
  netWorthTile: {
    direction: 'down-right',
    stops: [stop('ramp-5', 0.22, 0), stop('ramp-5', 0, 1)],
  },
} as const satisfies Record<string, RampFill>;

/** The Net worth plot's value label: `paper` text on an opaque `ink` plate, over the bands. */
export const PLOT_LABEL = { plate: 'ink', text: 'paper' } as const;

export interface TextOnRampFill {
  name: string;
  fill: RampFill;
  /** The opaque token the text sits on, when it is on a plate rather than on the fill. */
  plate?: string;
  /** The text tokens written on it. */
  texts: readonly string[];
}

/** Every gradient a text can sit on, and that text. */
export const TEXT_ON_RAMP_FILLS: readonly TextOnRampFill[] = [
  {
    name: 'the Net worth tile',
    fill: RAMP_FILLS.netWorthTile,
    texts: ['ink', 'muted', 'positive', 'negative', 'warning'],
  },
  ...[RAMP_FILLS.currentBand, RAMP_FILLS.savingsBand, RAMP_FILLS.pillarBand].map((fill, i) => ({
    name: `the Net worth plot's value label on band ${i + 1}`,
    fill,
    plate: PLOT_LABEL.plate,
    texts: [PLOT_LABEL.text],
  })),
];

/** Where a gradient runs, across its mark's box: as a CSS direction and as an SVG vector. */
export interface RampDirection {
  css: string;
  vector: { x1: number; y1: number; x2: number; y2: number };
}

/** The one map of directions, so the HTML and SVG gradients always run the same way. */
export const RAMP_DIRECTIONS: Record<RampFill['direction'], RampDirection> = {
  down: { css: 'to bottom', vector: { x1: 0, y1: 0, x2: 0, y2: 1 } },
  up: { css: 'to top', vector: { x1: 0, y1: 1, x2: 0, y2: 0 } },
  'down-right': { css: 'to bottom right', vector: { x1: 0, y1: 0, x2: 1, y2: 1 } },
};

/** The fill as a CSS `background-image`, its steps read from the tokens. */
export function cssGradient(fill: RampFill): string {
  const stops = fill.stops.map(
    ({ token, alpha, at }) =>
      `color-mix(in srgb, var(--color-${token}) ${alpha * 100}%, transparent) ${at * 100}%`,
  );
  return `linear-gradient(${RAMP_DIRECTIONS[fill.direction].css}, ${stops.join(', ')})`;
}
