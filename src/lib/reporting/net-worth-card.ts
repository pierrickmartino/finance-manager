import { isAccountKind, type AccountKind } from '@/server/services/accounts/input';
import type { ReportHeader } from '@/server/services/reporting/headers';
import { periodKey, periodSpan } from '@/server/services/reporting/periods';
import type { TimeAxis } from '@/server/services/reporting/query';
import type { CardFact, CardReading } from './card';
import type { ChartCapital, ChartMarker, ChartSource } from './chart-data';
import { periodValues, type PeriodValue } from './period-values';

/**
 * The Net worth card (GLOSSARY: Card, Net worth): what a balances Widget with a time axis
 * says and draws. Amounts are minor units.
 */

/** A capital movement drawn on the Net worth line. */
export interface LineMarker {
  /** Where on the line, in points: 1.5 is halfway from the second point to the third. */
  at: number;
  date: string;
  /** Its Payee (or Category) and CHF amount. */
  title: string;
  /** Its Transaction detail. */
  href: string;
}

/** One account kind's band under the Net worth line: its value at each point (loans below zero). */
export interface NetWorthBand {
  key: AccountKind;
  label: string;
  points: PeriodValue[];
}

/** The Net worth line, the bands under it and its capital movements. */
export interface NetWorthLineMark {
  type: 'netWorthLine';
  points: PeriodValue[];
  bands: NetWorthBand[];
  markers?: LineMarker[];
}

/**
 * Net worth under the overview's headline: the line and its capital movements, no bands
 * (GLOSSARY: Dashboard Story).
 */
export type HeadlineTrend = Pick<NetWorthLineMark, 'points'> & { markers: LineMarker[] };

type Money = (minor: number) => string;

/** What the Net worth card says and draws. */
export type NetWorthReading = Pick<CardReading, 'lead' | 'facts'> & { mark: NetWorthLineMark };

/**
 * Each account kind's band: its value per period, each linking to that kind's Accounts then.
 * The columns are keyed by kind; a column of no kind has no band.
 */
function netWorthBands(data: ChartSource): NetWorthBand[] {
  return data.columns.flatMap((column, c) => {
    const key = column.key;
    if (!isAccountKind(key)) return [];
    const points = data.rows.map((row, r) => ({
      label: row.label,
      value: data.cells[r]?.[c] ?? 0,
      href: data.hrefs.cells[r]?.[c] ?? data.hrefs.rowTotals[r] ?? data.hrefs.total,
      isPartial: row.isPartial,
    }));
    return [{ key, label: column.label, points }];
  });
}

/**
 * Each account kind's share at the latest point, sized by magnitude as the balances share card
 * sizes its parts (so a loan's share is of everything held or owed); a kind at zero is left out.
 */
function kindShareFacts(bands: NetWorthBand[], money: Money): CardFact[] {
  const latest = bands.flatMap((band) => {
    const point = band.points.at(-1);
    return point && point.value !== 0 ? [{ label: band.label, point }] : [];
  });
  const whole = latest.reduce((total, { point }) => total + Math.abs(point.value), 0);
  return latest.map(({ label, point }) => {
    const share = Math.round((Math.abs(point.value) / whole) * 100);
    return { label, value: `${money(point.value)} · ${share}%`, href: point.href };
  });
}

/**
 * Net worth over time: where it stood at the latest point (so far, while that period runs)
 * and how far it moved since the first, both opening the Accounts as of the latest point.
 */
function netWorthSentences(
  points: PeriodValue[],
  money: Money,
): Pick<CardReading, 'lead' | 'facts'> {
  const first = points[0]!;
  const latest = points.at(-1)!;
  const change = latest.value - first.value;
  const range = first === latest ? latest.label : `${first.label} – ${latest.label}`;
  const movement =
    change === 0 ? 'unchanged' : `${change > 0 ? 'up' : 'down'} ${money(Math.abs(change))}`;
  const standing = latest.isPartial
    ? `Net worth is ${money(latest.value)} so far in ${latest.label}`
    : `Net worth was ${money(latest.value)} at the end of ${latest.label}`;
  return {
    lead: {
      headline: `${standing}, ${movement} over ${range}.`,
      detail: money(latest.value),
      href: latest.href,
    },
    facts: [
      {
        label: `Change over ${range}`,
        value: `${change > 0 ? '+' : ''}${money(change)}`,
        href: latest.href,
      },
    ],
  };
}

/** How many capital movements the range holds, opening their Transactions list. */
function capitalFact({ markers, href }: ChartCapital): CardFact {
  return { label: 'Capital movements', value: String(markers.length), href };
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/**
 * Each capital movement on the line at its date: points stand at their period's last day, so
 * a movement is that far through its period past the previous point (never before the first).
 */
function lineMarkers(
  rows: ReportHeader[],
  markers: readonly ChartMarker[],
  axis: TimeAxis,
  money: Money,
): LineMarker[] {
  return markers.flatMap((marker) => {
    const index = rows.findIndex((row) => row.key === periodKey(marker.date, axis));
    if (index < 0) return [];
    const period = periodSpan(rows[index]!.key!, axis);
    const start = dayNumber(period.from);
    const through = (dayNumber(marker.date) - start + 1) / (dayNumber(period.to) - start + 1);
    const title =
      marker.amountMinor === null ? marker.label : `${marker.label}: ${money(marker.amountMinor)}`;
    return [{ at: Math.max(0, index - 1 + through), date: marker.date, title, href: marker.href }];
  });
}

/**
 * The Net worth card: its sentences and change, each account kind's share, and with capital
 * movements their count; the line over the bands, with the movements on it. Its rows are
 * periods of `axis`, which places the movements.
 */
export function readNetWorth(
  data: ChartSource,
  axis: TimeAxis | null,
  money: Money,
): NetWorthReading {
  const points = periodValues(data);
  const bands = netWorthBands(data);
  const { lead, facts } = netWorthSentences(points, money);
  const capital = axis && data.capital ? { ...data.capital, axis } : null;
  return {
    lead,
    facts: [...facts, ...kindShareFacts(bands, money), ...(capital ? [capitalFact(capital)] : [])],
    mark: {
      type: 'netWorthLine',
      points,
      bands,
      ...(capital && { markers: lineMarkers(data.rows, capital.markers, capital.axis, money) }),
    },
  };
}

/** The overview headline's trend from a monthly Net worth table: its line and markers. */
export function readHeadlineTrend(data: ChartSource, money: Money): HeadlineTrend {
  if (data.rows.length === 0) return { points: [], markers: [] };
  const { points, markers = [] } = readNetWorth(data, 'month', money).mark;
  return { points, markers };
}
