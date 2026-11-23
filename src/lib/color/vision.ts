/**
 * Colour vision, by hand (no dependency): how far apart two colours look (CIEDE2000 ΔE in
 * CIELAB, D65) and how a colour looks under colour blindness (Machado, Oliveira & Fernandes
 * 2009, severity 1.0, applied in linear sRGB). The categorical chart palette's colour-blind
 * safety (design-tokens.test.ts) is measured with them. Colours are what `parseColor` reads.
 */
import { parseColor } from './contrast';

export type Deficiency = 'protan' | 'deutan' | 'tritan';

export interface Lab {
  L: number;
  a: number;
  b: number;
}

type Matrix = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** Machado et al. 2009, severity 1.0 (full dichromacy). */
const MACHADO: Record<Deficiency, Matrix> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** sRGB (linear) to CIE XYZ, D65. */
const RGB_TO_XYZ: Matrix = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

const D65 = [0.95047, 1, 1.08883] as const;

type Triple = [number, number, number];

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

function apply(m: Matrix, [x, y, z]: Triple): Triple {
  return [
    m[0][0] * x + m[0][1] * y + m[0][2] * z,
    m[1][0] * x + m[1][1] * y + m[1][2] * z,
    m[2][0] * x + m[2][1] * y + m[2][2] * z,
  ];
}

function linearRgb(color: string): Triple {
  const { r, g, b } = parseColor(color);
  return [toLinear(r), toLinear(g), toLinear(b)];
}

/** The colour as someone with the given dichromacy sees it, as `#rrggbb`. */
export function simulate(color: string, deficiency: Deficiency): string {
  const seen = apply(MACHADO[deficiency], linearRgb(color));
  return `#${seen.map((c) => fromLinear(c).toString(16).padStart(2, '0')).join('')}`;
}

/** CIELAB (D65) of an opaque colour. */
export function toLab(color: string): Lab {
  const xyz = apply(RGB_TO_XYZ, linearRgb(color));
  const [fx, fy, fz] = xyz.map((v, i) => {
    const t = v / D65[i]!;
    return t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
  }) as Triple;
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const DEG = Math.PI / 180;

function hueDegrees(b: number, a: number): number {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) / DEG;
  return h < 0 ? h + 360 : h;
}

/** CIEDE2000 colour difference (kL = kC = kH = 1). */
export function ciede2000(first: Lab, second: Lab): number {
  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const cMean7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cMean7 / (cMean7 + 25 ** 7)));
  const a1 = (1 + g) * first.a;
  const a2 = (1 + g) * second.a;
  const C1 = Math.hypot(a1, first.b);
  const C2 = Math.hypot(a2, second.b);
  const h1 = hueDegrees(first.b, a1);
  const h2 = hueDegrees(second.b, a2);

  const dL = second.L - first.L;
  const dC = C2 - C1;
  let dh = 0;
  if (C1 * C2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * DEG);

  const Lm = (first.L + second.L) / 2;
  const Cm = (C1 + C2) / 2;
  let hm = h1 + h2;
  if (C1 * C2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) hm = (h1 + h2) / 2;
    else hm = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos((hm - 30) * DEG) +
    0.24 * Math.cos(2 * hm * DEG) +
    0.32 * Math.cos((3 * hm + 6) * DEG) -
    0.2 * Math.cos((4 * hm - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Cm7 = Cm ** 7;
  const rc = 2 * Math.sqrt(Cm7 / (Cm7 + 25 ** 7));
  const sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const sc = 1 + 0.045 * Cm;
  const sh = 1 + 0.015 * Cm * t;
  const rt = -Math.sin(2 * dTheta * DEG) * rc;

  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

/** CIEDE2000 ΔE between two opaque colours. */
export function deltaE(first: string, second: string): number {
  return ciede2000(toLab(first), toLab(second));
}
