'use client';

/**
 * PROTOTYPE (throwaway) — Variant E "Poster" (light only). A Swiss typographic poster: white,
 * black and flag red, Archivo stretched from 62% to 125%. The hero is a dot matrix of every
 * month × Category, sized by money, which assembles itself once on load. Everything else stays
 * still: net worth as a 10×10 waffle, net cash flow as a barcode.
 */
import '@fontsource-variable/archivo/wdth.css';
import NumberFlow from '@number-flow/react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  monthlyFlowOf,
  savingsRateOf,
  seriesOf,
  slicesOf,
  splitPath,
  type MonthlyFlow,
  type ProtoProps,
  type ProtoWidget,
} from './data';
import { OTHER_LABEL } from '@/lib/reporting/chart-data';
import { CHF_FORMAT, useMoney, type Money } from './money';

const RED = '#e30613';
const BLACK = '#000000';
const GREY = '#8a8a8a';
const EMPTY = '#ececec';
const FONT = '"Archivo Variable", "Helvetica Neue", Arial, sans-serif';

const condensed = { fontStretch: '62%', fontWeight: 800, letterSpacing: '-0.02em' } as const;
const wide = { fontStretch: '125%', fontWeight: 500 } as const;

const CELL = 54;
const LABEL_W = 210;
const TOTAL_W = 130;

function DotMatrix({ flow, money }: { flow: MonthlyFlow; money: Money }) {
  const isReduced = useReducedMotion();
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const rows = [
    {
      label: 'Income',
      values: flow.income,
      total: flow.income.reduce((sum, v) => sum + v, 0),
      isIncome: true,
    },
    ...flow.spending
      .slice(0, 9)
      .map((item) => ({ ...item, label: splitPath(item.label)[1], isIncome: false })),
  ];
  const max = Math.max(...rows.flatMap((row) => row.values));
  const width = LABEL_W + flow.months.length * CELL + TOTAL_W;
  const height = 40 + rows.length * CELL;
  const active = hover ? rows[hover.row]!.values[hover.col] : null;
  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Income and spending per Category, month by month"
        onMouseLeave={() => setHover(null)}
      >
        {flow.months.map((month, col) => (
          <text
            key={month}
            x={LABEL_W + col * CELL + CELL / 2}
            y={20}
            textAnchor="middle"
            fontSize={13}
            fill={hover?.col === col ? RED : GREY}
            style={{ fontFamily: FONT, ...wide }}
          >
            {month.slice(0, 3)}
          </text>
        ))}
        {rows.map((row, r) => {
          const y = 40 + r * CELL + CELL / 2;
          const isRowDim = hover !== null && hover.row !== r;
          return (
            <g key={row.label} opacity={isRowDim ? 0.35 : 1} style={{ transition: 'opacity .2s' }}>
              <text
                x={0}
                y={y + 6}
                fontSize={19}
                fill={BLACK}
                style={{ fontFamily: FONT, fontWeight: 600 }}
              >
                {row.label}
              </text>
              {row.values.map((value, col) => {
                const radius =
                  value > 0 ? Math.max(2.5, Math.sqrt(value / max) * (CELL * 0.46)) : 2;
                const delay = isReduced ? 0 : (r + col) * 0.035;
                return (
                  <g key={col} onMouseEnter={() => setHover({ row: r, col })}>
                    <rect
                      x={LABEL_W + col * CELL}
                      y={y - CELL / 2}
                      width={CELL}
                      height={CELL}
                      fill="transparent"
                    />
                    <motion.circle
                      cx={LABEL_W + col * CELL + CELL / 2}
                      cy={y}
                      fill={value === 0 ? EMPTY : row.isIncome ? RED : BLACK}
                      initial={{ r: 0 }}
                      animate={{ r: radius }}
                      transition={{ delay, type: 'spring', stiffness: 260, damping: 18 }}
                    />
                  </g>
                );
              })}
              <text
                x={width}
                y={y + 7}
                textAnchor="end"
                fontSize={24}
                fill={row.isIncome ? RED : BLACK}
                style={{ fontFamily: FONT, ...condensed }}
              >
                {money.compact(row.total)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 h-6 text-base" style={{ color: GREY }}>
        {hover && active !== null && active !== undefined ? (
          <>
            <span style={{ color: BLACK, fontWeight: 600 }}>{rows[hover.row]!.label}</span> in{' '}
            {flow.months[hover.col]}:{' '}
            <span style={{ color: BLACK, ...condensed, fontSize: 22 }}>{money.whole(active)}</span>
          </>
        ) : (
          'Each dot is one month of one Category, its area in proportion to the money. Point at a dot to read it.'
        )}
      </figcaption>
    </figure>
  );
}

function Waffle({ widget, money }: { widget: ProtoWidget; money: Money }) {
  const slices = slicesOf(widget).sort((a, b) => b.value - a.value);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const tones = [BLACK, RED, GREY, '#c4c4c4'];
  // Largest remainder, so the hundred squares always add up.
  const exact = slices.map((slice) => (slice.value / total) * 100);
  const counts = exact.map(Math.floor);
  const order = exact
    .map((value, i) => ({ i, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (let k = 0; k < 100 - counts.reduce((sum, v) => sum + v, 0); k++) counts[order[k]!.i]! += 1;
  const squares = counts.flatMap((count, i) =>
    Array.from({ length: count }, () => tones[i % tones.length]!),
  );
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end">
      <div
        className="grid w-56 grid-cols-10 gap-1"
        role="img"
        aria-label="Net worth by Account, in hundredths"
      >
        {squares.map((color, i) => (
          <span key={i} className="aspect-square" style={{ background: color }} />
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {slices.map((slice, i) => (
          <li key={slice.label} className="flex items-baseline gap-3">
            <span className="h-3 w-3 shrink-0" style={{ background: tones[i % tones.length] }} />
            <span className="text-3xl tabular-nums" style={condensed}>
              {counts[i]}
            </span>
            <span className="text-sm">
              {slice.label}
              <span className="block" style={{ color: GREY }}>
                {money.whole(slice.signedValue)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Barcode({ widget, money }: { widget: ProtoWidget; money: Money }) {
  const chart = seriesOf(widget);
  if (!chart) return null;
  const values = chart.points.map((point) =>
    Object.values(point.values).reduce<number>((sum, value) => sum + (value ?? 0), 0),
  );
  const max = Math.max(...values.map(Math.abs));
  return (
    <div>
      <div className="flex h-40 items-center gap-1.5">
        {values.map((value, i) => (
          <div
            key={i}
            className="flex h-full flex-1 flex-col justify-center"
            title={`${chart.points[i]!.label}: ${money.whole(value)}`}
          >
            <div className="flex h-1/2 items-end">
              {value > 0 && (
                <div
                  className="w-full"
                  style={{ height: `${(value / max) * 100}%`, background: BLACK }}
                />
              )}
            </div>
            <div className="flex h-1/2 items-start">
              {value < 0 && (
                <div
                  className="w-full"
                  style={{ height: `${(-value / max) * 100}%`, background: RED }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs" style={{ color: GREY, ...wide }}>
        <span>{chart.points[0]?.label}</span>
        <span>{chart.points[chart.points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function SwissCross() {
  return (
    <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden>
      <rect width="32" height="32" fill={RED} />
      <rect x="13" y="6" width="6" height="20" fill="#fff" />
      <rect x="6" y="13" width="20" height="6" fill="#fff" />
    </svg>
  );
}

/** "Rent hardly moves. Travel comes in waves." from the steadiest and the most uneven Category. */
function matrixHeadline(flow: MonthlyFlow): string {
  const spread = flow.spending
    .slice(0, 9)
    .map((item) => {
      const months = item.values.filter((value) => value > 0);
      const mean = months.reduce((sum, value) => sum + value, 0) / Math.max(1, months.length);
      const sd = Math.sqrt(
        months.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, months.length),
      );
      return { name: splitPath(item.label)[1], cv: mean ? sd / mean : 0, months: months.length };
    })
    .filter((item) => item.months >= 6 && item.name !== OTHER_LABEL);
  if (spread.length < 2) return 'Your year, one dot per month and Category.';
  const sorted = [...spread].sort((a, b) => a.cv - b.cv);
  return `${sorted[0]!.name} hardly moves. ${sorted[sorted.length - 1]!.name} comes in waves. Income is in red.`;
}

export function VariantPoster(props: ProtoProps) {
  const money = useMoney();
  const flow = useMemo(() => monthlyFlowOf(props.widgets), [props.widgets]);
  const balances = props.widgets.find((widget) => widget.source === 'account_balances');
  const net = props.widgets.find((widget) => widget.visualisation === 'line');
  const flowWidget = props.widgets.find((widget) => savingsRateOf(widget) !== null);
  const rate = flowWidget ? savingsRateOf(flowWidget) : null;
  const [worth, setWorth] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setWorth(money.major(balances?.data?.total ?? 0)), 200);
    return () => clearTimeout(timer);
  }, [balances, money]);

  return (
    <div
      className="-mx-2 bg-white px-6 py-10 text-black md:-mx-4 md:px-12 md:py-14"
      style={{ fontFamily: FONT, colorScheme: 'light' }}
    >
      <header className="grid gap-8 md:grid-cols-12">
        <div className="md:col-span-12">
          <div className="flex items-center gap-4">
            <SwissCross />
            <h1 className="text-2xl" style={wide}>
              {props.dashboardName}, last twelve months
            </h1>
          </div>
          {balances && (
            <>
              <p className="mt-10 text-lg" style={{ color: GREY }}>
                Net worth today
              </p>
              <p
                className="text-[clamp(4.5rem,13vw,11rem)] leading-[0.82] tabular-nums"
                style={condensed}
              >
                <NumberFlow value={worth} format={CHF_FORMAT} locales="de-CH" />
              </p>
            </>
          )}
        </div>
        {rate !== null && (
          <div className="flex items-end gap-5 md:col-span-12">
            <p
              className="text-[clamp(4.5rem,10vw,8.5rem)] leading-[0.82]"
              style={{ ...condensed, color: RED }}
            >
              {Math.round(rate * 100)}%
            </p>
            <p className="max-w-[16rem] pb-2 text-lg leading-snug">
              of everything earned stayed in the household.
            </p>
          </div>
        )}
      </header>

      {flow && (
        <section className="mt-16">
          <h2 className="mb-6 max-w-xl text-3xl leading-tight" style={{ fontWeight: 700 }}>
            {matrixHeadline(flow)}
          </h2>
          <DotMatrix flow={flow} money={money} />
        </section>
      )}

      <div className="mt-16 grid gap-14 md:grid-cols-12">
        {balances && (
          <section className="md:col-span-6">
            <h2 className="mb-6 text-3xl" style={{ fontWeight: 700 }}>
              Where the net worth sits
            </h2>
            <Waffle widget={balances} money={money} />
          </section>
        )}
        {net && (
          <section className="md:col-span-6">
            <h2 className="mb-6 text-3xl" style={{ fontWeight: 700 }}>
              {net.name}, month by month
            </h2>
            <Barcode widget={net} money={money} />
            <p className="mt-4 text-sm" style={{ color: GREY }}>
              Black above the line is a month that added money; red below took it away.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
