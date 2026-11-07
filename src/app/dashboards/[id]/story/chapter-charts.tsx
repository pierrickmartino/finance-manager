'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFormatter } from '@/components/formatter-provider';
import { toSeriesChart, type ChartSource } from '@/lib/reporting/chart-data';
import { rankedTotals, shareParts } from '@/lib/reporting/story';
import { STORY, STORY_TONES } from './palette';
import { INSTANT, useIsShown, useIsStill } from './stillness';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** How many Categories a ranking shows. */
const RANKING_LIMIT = 7;
const CHART_HEIGHT = 'h-80';

function useMoney() {
  const fmt = useFormatter();
  return {
    full: (minor: number) => fmt.amount(Math.round(minor), { currency: 'CHF', isWhole: true }),
    tick: (minor: number) => fmt.amount(Math.round(minor), { isWhole: true }),
  };
}

/** "Mar 2026" → "Mar" on the axis; the tooltip keeps the full label. */
const shortLabel = (label: string) => label.split(' ')[0] ?? label;

function rows(data: ChartSource) {
  const chart = toSeriesChart(data);
  return {
    chart,
    rows: chart.points.map((point) => ({ label: point.label, ...point.values })),
  };
}

const axis = {
  tick: { fill: STORY.muted, fontSize: 11 },
  tickLine: false,
  stroke: STORY.ink,
} as const;

function tooltipProps(money: (minor: number) => string) {
  return {
    formatter: (value: unknown) => money(Number(value)),
    contentStyle: { background: STORY.ink, border: 0, borderRadius: 6, fontSize: 12 },
    labelStyle: { color: STORY.paper },
    itemStyle: { color: STORY.paper },
  };
}

/** Charts animate in when their chapter scrolls into view, not on page load (at once when still). */
function OnView({ children, className }: { children: React.ReactNode; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useIsShown(ref, '-20% 0px');
  return (
    <div ref={ref} className={className}>
      {isInView && children}
    </div>
  );
}

/** A line over the periods, in ink over an accent wash, its last value written at the end. */
export function TrendChart({ data, title }: { data: ChartSource; title: string }) {
  const router = useRouter();
  const money = useMoney();
  const isStill = useIsStill();
  const gradientId = useId();
  const { chart, rows: points } = rows(data);
  const last = points.length - 1;
  return (
    <OnView className={CHART_HEIGHT}>
      <figure aria-label={`${title} line chart`} className="h-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 20, right: 64, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={STORY.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={STORY.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={STORY.rule} strokeDasharray="4 4" />
            <XAxis dataKey="label" tickFormatter={shortLabel} {...axis} />
            <YAxis tickFormatter={money.tick} width={64} {...axis} stroke="transparent" />
            <ReferenceLine y={0} stroke={STORY.ink} strokeOpacity={0.3} />
            <Tooltip {...tooltipProps(money.full)} />
            {chart.series.map((series) => (
              <Area
                key={series.key}
                dataKey={series.key}
                name={series.label}
                type="linear"
                stroke={STORY_TONES[series.slot % STORY_TONES.length]}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                animationDuration={1600}
                isAnimationActive={!isStill}
                activeDot={false}
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const href = chart.points[props.index ?? -1]?.hrefs[series.key] ?? null;
                  if (props.cx === undefined || props.cy === undefined)
                    return <g key={props.index} />;
                  return (
                    <g
                      key={props.index}
                      className={href ? 'cursor-pointer' : undefined}
                      onClick={href ? () => router.push(href) : undefined}
                    >
                      <circle cx={props.cx} cy={props.cy} r={10} fill="transparent" />
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={3.5}
                        fill={STORY.paper}
                        stroke={STORY.ink}
                        strokeWidth={2}
                      />
                    </g>
                  );
                }}
              >
                <LabelList
                  dataKey={series.key}
                  content={(props: {
                    x?: unknown;
                    y?: unknown;
                    index?: number;
                    value?: unknown;
                  }) =>
                    props.index === last && props.value != null ? (
                      <text
                        x={Number(props.x) + 10}
                        y={Number(props.y) + 4}
                        fill={STORY.accent}
                        fontSize={13}
                        fontWeight={700}
                      >
                        {money.tick(Number(props.value))}
                      </text>
                    ) : null
                  }
                />
              </Area>
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </figure>
    </OnView>
  );
}

/** Slim stacked bars per period: ink, then the accent; each segment drills down. */
export function PeriodBars({ data, title }: { data: ChartSource; title: string }) {
  const router = useRouter();
  const money = useMoney();
  const isStill = useIsStill();
  const { chart, rows: points } = rows(data);
  return (
    <OnView className={CHART_HEIGHT}>
      <figure aria-label={`${title} stacked bar chart`} className="h-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            stackOffset="sign"
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={STORY.rule} strokeDasharray="4 4" />
            <XAxis dataKey="label" tickFormatter={shortLabel} {...axis} />
            <YAxis tickFormatter={money.tick} width={64} {...axis} stroke="transparent" />
            <ReferenceLine y={0} stroke={STORY.ink} />
            <Tooltip
              cursor={{ fill: STORY.rule, fillOpacity: 0.5 }}
              {...tooltipProps(money.full)}
            />
            {chart.series.length > 1 && (
              <Legend
                verticalAlign="top"
                align="right"
                iconType="rect"
                wrapperStyle={{ fontSize: 12, color: STORY.ink, paddingBottom: 12 }}
              />
            )}
            {chart.series.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                stackId="period"
                barSize={14}
                fill={STORY_TONES[series.slot % STORY_TONES.length]}
                animationDuration={1200}
                isAnimationActive={!isStill}
                className="cursor-pointer"
                onClick={(_item, index) => {
                  const href = chart.points[index]?.hrefs[series.key];
                  if (href) router.push(href);
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </OnView>
  );
}

/** Categories ranked by money over the period, as typographic bars that grow into view. */
export function RankedBars({ data, title }: { data: ChartSource; title: string }) {
  const money = useMoney();
  const ref = useRef<HTMLOListElement>(null);
  const isStill = useIsStill();
  const isInView = useIsShown(ref, '-15% 0px');
  const items = rankedTotals(data, RANKING_LIMIT);
  const max = Math.max(1, ...items.map((item) => Math.abs(item.value)));
  return (
    <ol ref={ref} aria-label={`${title}, ranked`} className="flex flex-col gap-4">
      {items.map((item, index) => {
        const name = (
          <span className="font-display text-2xl md:text-3xl">
            {item.name}
            {item.group !== item.name && (
              <span className="ml-2 text-sm" style={{ color: STORY.muted }}>
                in {item.group}
              </span>
            )}
          </span>
        );
        return (
          <li
            key={`${item.group}/${item.name}`}
            className="grid grid-cols-[2.5rem_1fr] items-center gap-3"
          >
            <span className="font-display text-2xl italic" style={{ color: STORY.muted }}>
              {index + 1}
            </span>
            <div>
              <div className="flex items-baseline justify-between gap-4">
                {item.href ? (
                  <Link href={item.href} className="hover:underline">
                    {name}
                  </Link>
                ) : (
                  name
                )}
                <span className="text-sm tabular-nums">{money.full(Math.abs(item.value))}</span>
              </div>
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full"
                style={{ background: STORY.rule }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: index === 0 ? STORY.accent : STORY.ink }}
                  initial={{ width: 0 }}
                  animate={{ width: isInView ? `${(Math.abs(item.value) / max) * 100}%` : 0 }}
                  transition={
                    isStill ? INSTANT : { duration: 1.4, delay: index * 0.12, ease: EASE_OUT }
                  }
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The parts of a whole (e.g. Account balances) as one proportional band, with their shares. */
export function ShareBand({ data, title }: { data: ChartSource; title: string }) {
  const money = useMoney();
  const ref = useRef<HTMLDivElement>(null);
  const isStill = useIsStill();
  const isInView = useIsShown(ref, '-15% 0px');
  const parts = shareParts(data);
  const tone = (index: number) => STORY_TONES[index % STORY_TONES.length];
  return (
    <div ref={ref}>
      <div
        role="img"
        aria-label={`${title}, share of each part`}
        className="flex h-24 w-full gap-1"
      >
        {parts.map((part, index) => (
          <motion.div
            key={part.label}
            className="h-full first:rounded-l-xl last:rounded-r-xl"
            style={{ background: tone(index) }}
            initial={{ flexGrow: 0.0001 }}
            animate={{ flexGrow: isInView ? part.share : 0.0001 }}
            transition={isStill ? INSTANT : { duration: 1.6, delay: index * 0.15, ease: EASE_OUT }}
          />
        ))}
      </div>
      <dl className="mt-6 grid gap-6 sm:grid-cols-3">
        {parts.map((part, index) => (
          <div key={part.label} className="border-t-2 pt-3" style={{ borderColor: tone(index) }}>
            <dt className="text-sm" style={{ color: STORY.muted }}>
              {part.href ? (
                <Link href={part.href} className="hover:underline">
                  {part.label}
                </Link>
              ) : (
                part.label
              )}
            </dt>
            <dd className="mt-1 font-display text-3xl">{Math.round(part.share * 100)}%</dd>
            <dd className="text-sm tabular-nums">{money.full(part.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
