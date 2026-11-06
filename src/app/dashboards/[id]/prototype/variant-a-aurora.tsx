'use client';

/**
 * PROTOTYPE (throwaway) — Variant A "Aurora": a dark glass bento. Animated aurora backdrop,
 * count-up hero KPIs with sparklines, 3D-tilting glass cards, neon ECharts with glow.
 */
import NumberFlow from '@number-flow/react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { EChart, echarts, type EChartsOption } from './echart';
import {
  heroKpisOf,
  savingsRateOf,
  seriesOf,
  slicesOf,
  type Kpi,
  type ProtoProps,
  type ProtoWidget,
} from './data';
import { CHF_FORMAT, useMoney, type Money } from './money';
import { APP, VARIANT_ROOT_STYLE } from './theme';

const NEON = [
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#059669',
  '#d97706',
  '#e11d48',
  '#2563eb',
  '#65a30d',
];
const AXIS = APP.muted;
const GRID = APP.border;

const gradient = (color: string, from = 0.85, to = 0.05) =>
  new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: hexA(color, from) },
    { offset: 1, color: hexA(color, to) },
  ]);

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const tooltip = (money: Money) => ({
  trigger: 'axis',
  backgroundColor: 'rgba(255,255,255,0.85)',
  borderColor: APP.border,
  borderWidth: 1,
  padding: [10, 14],
  textStyle: { color: APP.ink, fontSize: 12 },
  extraCssText:
    'backdrop-filter: blur(12px); border-radius: 14px; box-shadow: 0 12px 32px -12px rgba(24,24,27,.25);',
  valueFormatter: (value: unknown) => money.whole(Number(value)),
  axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(139,92,246,0.08)' } },
});

const axes = (labels: string[], money: Money) => ({
  grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
  xAxis: {
    type: 'category' as const,
    data: labels.map((label) => label.replace(/ (\d{2})(\d{2})$/, " '$2")),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: AXIS, fontSize: 11 },
  },
  yAxis: {
    type: 'value' as const,
    splitLine: { lineStyle: { color: GRID } },
    axisLabel: { color: AXIS, fontSize: 11, formatter: (value: number) => money.compact(value) },
  },
});

function lineOption(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  return {
    ...axes(
      chart.points.map((point) => point.label),
      money,
    ),
    tooltip: { ...tooltip(money), axisPointer: { type: 'line', lineStyle: { color: '#7c3aed' } } },
    animationDuration: 2200,
    animationEasing: 'cubicOut',
    series: chart.series.map((series, index) => {
      const color = NEON[(index + 1) % NEON.length]!;
      return {
        type: 'line',
        name: series.label,
        smooth: 0.35,
        symbol: 'circle',
        symbolSize: 8,
        showSymbol: false,
        data: chart.points.map((point) => point.values[series.key]),
        lineStyle: { width: 3, color, shadowColor: color, shadowBlur: 18 },
        itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: gradient(color, 0.45, 0) },
        emphasis: { focus: 'series' },
        markPoint: {
          symbol: 'pin',
          symbolSize: 44,
          label: {
            fontSize: 10,
            formatter: (p: { value?: unknown }) => money.compact(Number(p.value)),
          },
          itemStyle: { color, shadowBlur: 20, shadowColor: color },
          data: [
            { type: 'max', name: 'max' },
            { type: 'min', name: 'min' },
          ],
        },
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: APP.muted, type: 'dashed' },
          label: { color: AXIS, formatter: 'avg' },
          data: [{ type: 'average' }],
        },
      };
    }),
  };
}

function barOption(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  return {
    ...axes(
      chart.points.map((point) => point.label),
      money,
    ),
    tooltip: tooltip(money),
    legend: {
      show: chart.series.length > 1,
      bottom: 0,
      type: 'scroll',
      icon: 'circle',
      itemWidth: 8,
      textStyle: { color: AXIS, fontSize: 11 },
      pageTextStyle: { color: AXIS },
    },
    grid: {
      left: 8,
      right: 16,
      top: 24,
      bottom: chart.series.length > 1 ? 36 : 8,
      containLabel: true,
    },
    animationDuration: 1400,
    animationEasing: 'elasticOut',
    animationDelay: (index: number) => index * 60,
    series: chart.series.map((series, index) => {
      const color = NEON[index % NEON.length]!;
      return {
        type: 'bar',
        name: series.label,
        stack: 'total',
        barWidth: '58%',
        data: chart.points.map((point) => point.values[series.key]),
        itemStyle: {
          color: gradient(color, 1, 0.55),
          borderRadius: 3,
          shadowColor: hexA(color, 0.6),
          shadowBlur: 12,
        },
        emphasis: { focus: 'series', itemStyle: { shadowBlur: 30 } },
      };
    }),
  };
}

function roseOption(widget: ProtoWidget, money: Money): EChartsOption | null {
  const slices = slicesOf(widget);
  if (slices.length === 0) return null;
  return {
    tooltip: { ...tooltip(money), trigger: 'item' },
    animationDuration: 1800,
    animationEasing: 'elasticOut',
    series: [
      {
        type: 'pie',
        roseType: 'radius',
        radius: ['22%', '82%'],
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 3 },
        label: { color: APP.ink, fontSize: 11 },
        labelLine: { lineStyle: { color: AXIS } },
        data: slices.map((slice) => ({
          name: slice.label,
          value: slice.value,
          itemStyle: { color: gradient(NEON[slice.slot % NEON.length]!, 1, 0.5) },
        })),
      },
    ],
  };
}

function balanceOption(widget: ProtoWidget, money: Money): EChartsOption | null {
  const slices = slicesOf(widget).sort((a, b) => a.value - b.value);
  if (slices.length === 0) return null;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return {
    grid: { left: 8, right: 110, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...tooltip(money), trigger: 'item' },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: slices.map((slice) => slice.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: APP.ink, fontSize: 12 },
    },
    animationDuration: 1600,
    series: [
      {
        type: 'bar',
        barWidth: 18,
        showBackground: true,
        backgroundStyle: { color: APP.track, borderRadius: 9 },
        data: slices.map((slice, index) => ({
          value: slice.value,
          itemStyle: {
            borderRadius: 9,
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: NEON[(index + 2) % NEON.length]! },
              { offset: 1, color: NEON[(index + 3) % NEON.length]! },
            ]),
            shadowBlur: 18,
            shadowColor: hexA(NEON[(index + 2) % NEON.length]!, 0.7),
          },
        })),
        label: {
          show: true,
          position: 'right',
          color: APP.ink,
          fontWeight: 600,
          formatter: (p: { value?: unknown }) =>
            `${money.compact(Number(p.value))}  ·  ${Math.round((Number(p.value) / total) * 100)}%`,
        },
      },
    ],
  };
}

function optionFor(widget: ProtoWidget, money: Money): EChartsOption | null {
  if (widget.source === 'account_balances') return balanceOption(widget, money);
  switch (widget.visualisation) {
    case 'line':
      return lineOption(widget, money);
    case 'donut':
      return roseOption(widget, money);
    case 'stacked_bar':
      return barOption(widget, money);
    case 'table':
      return slicesOf(widget).length ? balanceOption(widget, money) : barOption(widget, money);
    case 'number':
      return null;
  }
}

function sparkOption(kpi: Kpi, color: string): EChartsOption {
  return {
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { type: 'category', show: false, boundaryGap: false },
    yAxis: { type: 'value', show: false, scale: true },
    animationDuration: 2000,
    series: [
      {
        type: 'line',
        data: kpi.trend,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color, shadowBlur: 10, shadowColor: color },
        areaStyle: { color: gradient(color, 0.4, 0) },
      },
    ],
  };
}

/** A glass card that tilts toward the cursor and carries a spotlight. */
function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const rx = useSpring(0, { stiffness: 150, damping: 18 });
  const ry = useSpring(0, { stiffness: 150, damping: 18 });
  const spotlight = useMotionTemplate`radial-gradient(500px circle at ${mx}% ${my}%, rgba(124,58,237,0.08), transparent 45%)`;
  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    mx.set(px * 100);
    my.set(py * 100);
    rx.set((0.5 - py) * 6);
    ry.set((px - 0.5) * 6);
  };
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 40, scale: 0.96 },
        show: { opacity: 1, y: 0, scale: 1 },
      }}
      transition={{ type: 'spring', stiffness: 90, damping: 16 }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      className={`group relative overflow-hidden rounded-3xl border border-zinc-200 bg-white/75 shadow-[0_18px_40px_-24px_rgba(24,24,27,0.35)] backdrop-blur-xl ${className}`}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: spotlight }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="relative h-full">{children}</div>
    </motion.div>
  );
}

function Aurora() {
  const blobs = [
    { color: '#7c3aed', size: 620, x: ['-10%', '30%', '-10%'], y: ['-20%', '10%', '-20%'], d: 18 },
    { color: '#06b6d4', size: 520, x: ['60%', '20%', '60%'], y: ['-10%', '30%', '-10%'], d: 22 },
    { color: '#db2777', size: 480, x: ['70%', '90%', '70%'], y: ['50%', '20%', '50%'], d: 26 },
    { color: '#10b981', size: 420, x: ['10%', '40%', '10%'], y: ['70%', '50%', '70%'], d: 30 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {blobs.map((blob) => (
        <motion.div
          key={blob.color}
          className="absolute rounded-full opacity-[0.16] blur-[110px]"
          style={{ width: blob.size, height: blob.size, background: blob.color }}
          animate={{ left: blob.x, top: blob.y }}
          transition={{ duration: blob.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(24,24,27,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(24,24,27,.07) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at 50% 0%, black 20%, transparent 70%)',
        }}
      />
    </div>
  );
}

function useCountUp(value: number): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setShown(value), 350);
    return () => clearTimeout(timer);
  }, [value]);
  return shown;
}

function KpiCard({ kpi, index, money }: { kpi: Kpi; index: number; money: Money }) {
  const router = useRouter();
  const color = NEON[(index * 3 + 1) % NEON.length]!;
  const value = useCountUp(money.major(kpi.value));
  const spark = useMemo(() => sparkOption(kpi, color), [kpi, color]);
  const isUp = (kpi.momentum ?? 0) >= 0;
  // Spending going up is bad news: flip the colour for negative KPIs.
  const isGood = kpi.value < 0 ? !isUp : isUp;
  return (
    <GlassCard className="cursor-pointer p-5">
      <button
        type="button"
        onClick={() => router.push(kpi.href)}
        className="block w-full text-left"
      >
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 12px ${color}` }}
          />
          {kpi.label}
        </div>
        <div className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 tabular-nums md:text-4xl">
          <NumberFlow value={value} format={CHF_FORMAT} locales="de-CH" />
        </div>
        {kpi.momentum !== null && (
          <span
            className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
          >
            {isUp ? '▲' : '▼'} {Math.abs(Math.round(kpi.momentum * 100))}% vs. avg
          </span>
        )}
        {kpi.trend.length > 0 && <EChart option={spark} className="mt-3 h-14 w-full" />}
      </button>
    </GlassCard>
  );
}

function SavingsRing({ rate }: { rate: number }) {
  const shown = useCountUp(rate);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return (
    <GlassCard className="flex items-center gap-5 p-5">
      <svg viewBox="0 0 128 128" className="h-24 w-24 shrink-0 -rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" x2="1">
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={radius} stroke={APP.track} strokeWidth="12" fill="none" />
        <motion.circle
          cx="64"
          cy="64"
          r={radius}
          stroke="url(#ring)"
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - Math.max(0, Math.min(1, rate))) }}
          transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          style={{ filter: 'drop-shadow(0 4px 8px rgba(5,150,105,.35))' }}
        />
      </svg>
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Savings rate
        </div>
        <div className="mt-2 text-4xl font-semibold text-zinc-900">
          <NumberFlow value={shown} format={{ style: 'percent', maximumFractionDigits: 0 }} />
        </div>
        <div className="mt-1 text-xs text-zinc-500">of income kept, last 12 months</div>
      </div>
    </GlassCard>
  );
}

const SPANS = [
  'lg:col-span-4 lg:row-span-2',
  'lg:col-span-2 lg:row-span-2',
  'lg:col-span-3 lg:row-span-2',
  'lg:col-span-3 lg:row-span-2',
];

function WidgetCard({
  widget,
  index,
  money,
}: {
  widget: ProtoWidget;
  index: number;
  money: Money;
}) {
  const router = useRouter();
  const option = useMemo(() => optionFor(widget, money), [widget, money]);
  const chart = seriesOf(widget);
  const onClick = (params: { dataIndex: number; seriesIndex?: number }) => {
    const series = chart?.series[params.seriesIndex ?? 0];
    const href = series ? chart?.points[params.dataIndex]?.hrefs[series.key] : null;
    if (href) router.push(href);
  };
  return (
    <GlassCard className={`flex min-h-[340px] flex-col p-5 ${SPANS[index % SPANS.length]}`}>
      <div className="flex h-full flex-col">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">{widget.name}</h2>
          {widget.data?.total != null && (
            <span className="font-mono text-xs text-zinc-400">
              Σ {money.whole(widget.data.total)}
            </span>
          )}
        </div>
        {widget.error && <p className="text-sm text-rose-700">{widget.error}</p>}
        {option ? (
          <EChart option={option} onClick={onClick} className="min-h-[260px] flex-1" />
        ) : (
          <div className="flex flex-1 items-center text-5xl font-semibold text-zinc-900">
            {widget.data?.total != null ? money.whole(widget.data.total) : '—'}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

export function VariantAurora({ dashboardName, widgets }: ProtoProps) {
  const money = useMoney();
  const kpis = heroKpisOf(widgets);
  const rate = widgets.map(savingsRateOf).find((value) => value !== null) ?? null;
  return (
    <div
      className="relative -mx-2 overflow-hidden rounded-[32px] px-5 py-8 md:-mx-4 md:px-8 md:py-10"
      style={VARIANT_ROOT_STYLE}
    >
      <Aurora />
      <motion.div
        initial="hidden"
        animate="show"
        transition={{ staggerChildren: 0.09 }}
        className="relative flex flex-col gap-6"
      >
        <motion.header
          variants={{ hidden: { opacity: 0, y: -20 }, show: { opacity: 1, y: 0 } }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs text-zinc-600 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live · all amounts in CHF
            </div>
            <h1 className="bg-gradient-to-r from-zinc-900 via-violet-700 to-cyan-700 bg-clip-text text-5xl font-semibold tracking-tight text-transparent md:text-6xl">
              {dashboardName}
            </h1>
          </div>
        </motion.header>
        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {rate !== null && <SavingsRing rate={rate} />}
          {kpis.slice(0, rate !== null ? 3 : 4).map((kpi, index) => (
            <KpiCard key={kpi.id} kpi={kpi} index={index} money={money} />
          ))}
        </motion.div>
        <motion.div
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
          }}
          className="grid auto-rows-[190px] gap-4 lg:grid-cols-6"
        >
          {widgets.map((widget, index) => (
            <WidgetCard key={widget.id} widget={widget} index={index} money={money} />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
