'use client';

/**
 * PROTOTYPE (throwaway) — Variant C "Cockpit": a mission-control HUD. A live ticker of every
 * total, a rail to pick one Widget, and one huge stage that shows it through switchable
 * "lenses" (Sankey flow, sunburst, treemap, heatmap, radial clock, cumulative curve...).
 */
import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EChart, echarts, type EChartsOption } from './echart';
import {
  heroKpisOf,
  insightsOf,
  kpiOf,
  seriesOf,
  seriesTotals,
  slicesOf,
  splitPath,
  type Kpi,
  type ProtoProps,
  type ProtoWidget,
} from './data';
import { CHF_FORMAT, useMoney, type Money } from './money';

const CYAN = '#00f0ff';
const PINK = '#ff2bd6';
const LIME = '#b6ff3b';
const HUD = [
  '#00f0ff',
  '#ff2bd6',
  '#b6ff3b',
  '#ffb000',
  '#7a5cff',
  '#ff5f5f',
  '#2bffb1',
  '#4da3ff',
];
const DIM = 'rgba(160,220,255,0.5)';

type Lens = {
  key: string;
  label: string;
  build: (widget: ProtoWidget, money: Money) => EChartsOption | null;
};

const baseTooltip = (money: Money) => ({
  backgroundColor: 'rgba(3,10,20,0.9)',
  borderColor: CYAN,
  borderWidth: 1,
  textStyle: { color: '#dff', fontFamily: 'ui-monospace, monospace', fontSize: 12 },
  extraCssText: 'box-shadow: 0 0 24px rgba(0,240,255,.35); border-radius: 4px;',
  valueFormatter: (value: unknown) => money.whole(Number(value)),
});

function sankey(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  const totals = seriesTotals(chart).filter((item) => item.value !== 0);
  const root = widget.name;
  const groups = new Map<string, number>();
  const links: { source: string; target: string; value: number }[] = [];
  for (const item of totals) {
    const [group, name] = splitPath(item.label);
    groups.set(group, (groups.get(group) ?? 0) + Math.abs(item.value));
    if (group !== name)
      links.push({ source: group, target: `${name}​`, value: Math.abs(item.value) });
  }
  for (const [group, value] of groups) links.unshift({ source: root, target: group, value });
  const names = new Set(links.flatMap((link) => [link.source, link.target]));
  return {
    tooltip: { ...baseTooltip(money), trigger: 'item' },
    series: [
      {
        type: 'sankey',
        left: 10,
        right: 140,
        top: 20,
        bottom: 20,
        nodeGap: 14,
        nodeWidth: 14,
        emphasis: { focus: 'adjacency' },
        draggable: true,
        data: [...names].map((name, index) => ({
          name,
          itemStyle: {
            color: HUD[index % HUD.length],
            borderColor: HUD[index % HUD.length],
            shadowBlur: 14,
            shadowColor: HUD[index % HUD.length],
          },
        })),
        links,
        lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.55 },
        label: {
          color: '#e6fbff',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          formatter: (p: { name: string; value?: unknown }) =>
            `${p.name}  ${money.compact(Number(p.value))}`,
        },
        animationDuration: 2000,
      },
    ],
  };
}

function hierarchy(widget: ProtoWidget) {
  const chart = seriesOf(widget);
  const items =
    chart && chart.series.length > 1
      ? seriesTotals(chart).map((item) => ({ label: item.label, value: Math.abs(item.value) }))
      : slicesOf(widget).map((slice) => ({
          label: slice.label.replace(' · ', ' › '),
          value: slice.value,
        }));
  const groups = new Map<string, { name: string; value: number }[]>();
  for (const item of items) {
    if (item.value === 0) continue;
    const [group, name] = splitPath(item.label);
    groups.set(group, [...(groups.get(group) ?? []), { name, value: item.value }]);
  }
  return [...groups].map(([name, children], index) => ({
    name,
    itemStyle: { color: HUD[index % HUD.length] },
    children: children.length === 1 && children[0]!.name === name ? undefined : children,
    value: children.reduce((sum, child) => sum + child.value, 0),
  }));
}

function sunburst(widget: ProtoWidget, money: Money): EChartsOption | null {
  const data = hierarchy(widget);
  if (data.length === 0) return null;
  return {
    tooltip: { ...baseTooltip(money), trigger: 'item' },
    series: [
      {
        type: 'sunburst',
        data,
        radius: ['14%', '92%'],
        sort: 'desc',
        itemStyle: { borderColor: '#050a14', borderWidth: 3, borderRadius: 6 },
        label: { color: '#04101c', fontWeight: 'bold', fontSize: 11, rotate: 'radial' },
        levels: [
          {},
          { r0: '14%', r: '50%' },
          { r0: '52%', r: '92%', itemStyle: { opacity: 0.75 } },
        ],
        emphasis: { focus: 'ancestor' },
        animationDuration: 1800,
        animationEasing: 'cubicOut',
      },
    ],
  };
}

function treemap(widget: ProtoWidget, money: Money): EChartsOption | null {
  const data = hierarchy(widget);
  if (data.length === 0) return null;
  return {
    tooltip: { ...baseTooltip(money), trigger: 'item' },
    series: [
      {
        type: 'treemap',
        data,
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: {
          itemStyle: { color: '#0b1a2b', borderColor: CYAN },
          textStyle: { color: CYAN },
        },
        width: '100%',
        height: '88%',
        top: 0,
        upperLabel: { show: true, height: 22, color: '#04101c', fontWeight: 'bold' },
        label: {
          color: '#04101c',
          fontWeight: 'bold',
          formatter: (p: { name: string; value?: unknown }) =>
            `${p.name}\n${money.compact(Number(p.value))}`,
        },
        itemStyle: { borderColor: '#050a14', borderWidth: 2, gapWidth: 2 },
        levels: [{ itemStyle: { borderWidth: 0, gapWidth: 4 } }, { colorSaturation: [0.45, 0.85] }],
        animationDuration: 1400,
      },
    ],
  };
}

function heatmap(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  const data: [number, number, number][] = [];
  chart.points.forEach((point, x) =>
    chart.series.forEach((series, y) => data.push([x, y, Math.abs(point.values[series.key] ?? 0)])),
  );
  const max = Math.max(...data.map((cell) => cell[2]));
  return {
    tooltip: {
      ...baseTooltip(money),
      trigger: 'item',
      valueFormatter: undefined,
      formatter: (p: { value?: unknown }) => {
        const [x, y, v] = p.value as [number, number, number];
        return `${chart.series[y]!.label}<br/>${chart.points[x]!.label}: <b>${money.whole(v)}</b>`;
      },
    },
    grid: { left: 8, right: 8, top: 8, bottom: 56, containLabel: true },
    xAxis: {
      type: 'category',
      data: chart.points.map((point) => point.label.split(' ')[0]),
      axisLabel: { color: DIM },
      axisLine: { show: false },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: chart.series.map((series) => splitPath(series.label)[1]),
      axisLabel: { color: DIM },
      axisLine: { show: false },
    },
    visualMap: {
      min: 0,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 240,
      textStyle: { color: DIM },
      formatter: (value: unknown) => money.compact(Number(value)),
      inRange: { color: ['#06121f', '#0b3550', '#00a7c4', CYAN, '#f7ff9e'] },
    },
    series: [
      {
        type: 'heatmap',
        data,
        itemStyle: { borderColor: '#050a14', borderWidth: 3, borderRadius: 4 },
        emphasis: { itemStyle: { shadowBlur: 20, shadowColor: CYAN } },
        animationDuration: 1200,
      },
    ],
  };
}

function radial(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  const isSingle = chart.series.length === 1;
  return {
    tooltip: { ...baseTooltip(money), trigger: 'axis' },
    polar: { radius: ['18%', '86%'] },
    angleAxis: {
      type: 'category',
      data: chart.points.map((point) => point.label.split(' ')[0]),
      startAngle: 90,
      axisLine: { lineStyle: { color: 'rgba(0,240,255,.25)' } },
      axisLabel: { color: DIM, fontFamily: 'ui-monospace, monospace' },
    },
    radiusAxis: {
      axisLabel: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(0,240,255,.08)' } },
    },
    legend: { show: !isSingle, bottom: 0, textStyle: { color: DIM } },
    animationDuration: 2000,
    animationDelay: (index: number) => index * 80,
    series: chart.series.map((series, index) => ({
      type: 'bar',
      coordinateSystem: 'polar',
      name: series.label,
      stack: 'radial',
      roundCap: true,
      data: chart.points.map((point) => {
        const value = point.values[series.key] ?? 0;
        const color = isSingle ? (value >= 0 ? CYAN : PINK) : HUD[index % HUD.length]!;
        return { value: Math.abs(value), itemStyle: { color, shadowBlur: 16, shadowColor: color } };
      }),
    })),
  };
}

function cumulative(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  let running = 0;
  const values = chart.points.map((point) => {
    running += Object.values(point.values).reduce<number>((sum, value) => sum + (value ?? 0), 0);
    return running;
  });
  return {
    tooltip: { ...baseTooltip(money), trigger: 'axis' },
    grid: { left: 8, right: 110, top: 24, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: chart.points.map((point) => point.label.split(' ')[0]),
      axisLabel: { color: DIM },
      axisLine: { lineStyle: { color: 'rgba(0,240,255,.3)' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: DIM, formatter: (value: number) => money.compact(value) },
      splitLine: { lineStyle: { color: 'rgba(0,240,255,.07)' } },
    },
    animationDuration: 2600,
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'diamond',
        symbolSize: 10,
        lineStyle: { width: 3, color: LIME, shadowBlur: 22, shadowColor: LIME },
        itemStyle: { color: LIME },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(182,255,59,.35)' },
            { offset: 1, color: 'rgba(182,255,59,0)' },
          ]),
        },
        endLabel: {
          show: true,
          color: LIME,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 14,
          formatter: (p: { value?: unknown }) => money.whole(Number(p.value)),
        },
      },
    ],
  };
}

function bars(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  return {
    tooltip: { ...baseTooltip(money), trigger: 'axis' },
    legend: {
      show: chart.series.length > 1,
      type: 'scroll',
      bottom: 0,
      textStyle: { color: DIM },
      pageTextStyle: { color: DIM },
    },
    grid: { left: 8, right: 8, top: 24, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: chart.points.map((point) => point.label.split(' ')[0]),
      axisLabel: { color: DIM },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: DIM, formatter: (value: number) => money.compact(value) },
      splitLine: { lineStyle: { color: 'rgba(0,240,255,.07)' } },
    },
    animationDuration: 1400,
    series: chart.series.map((series, index) => ({
      type: 'bar',
      name: series.label,
      stack: 'total',
      data: chart.points.map((point) => point.values[series.key]),
      itemStyle: {
        color: HUD[index % HUD.length],
        borderRadius: 3,
        shadowBlur: 10,
        shadowColor: HUD[index % HUD.length],
      },
      emphasis: { focus: 'series' },
    })),
  };
}

function polarShare(widget: ProtoWidget, money: Money): EChartsOption | null {
  const slices = slicesOf(widget).sort((a, b) => b.value - a.value);
  if (slices.length === 0) return null;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return {
    tooltip: { ...baseTooltip(money), trigger: 'item' },
    series: slices.map((slice, index) => ({
      type: 'gauge',
      startAngle: 90,
      endAngle: -270,
      radius: `${92 - index * 18}%`,
      pointer: { show: false },
      progress: {
        show: true,
        roundCap: true,
        width: 14,
        itemStyle: {
          color: HUD[index % HUD.length],
          shadowBlur: 18,
          shadowColor: HUD[index % HUD.length],
        },
      },
      axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(0,240,255,.06)']] } },
      splitLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      title: { show: false },
      detail: { show: false },
      data: [{ value: Math.round((slice.value / total) * 100), name: slice.label }],
      animationDuration: 2200,
    })),
    graphic: slices.map((slice, index) => ({
      type: 'text',
      right: 16,
      top: 20 + index * 26,
      style: {
        text: `● ${slice.label}  ${money.compact(slice.value)}`,
        fill: HUD[index % HUD.length],
        font: '12px ui-monospace, monospace',
      },
    })),
  };
}

function lensesFor(widget: ProtoWidget): Lens[] {
  const chart = seriesOf(widget);
  if (
    widget.source === 'account_balances' ||
    widget.visualisation === 'table' ||
    widget.visualisation === 'donut'
  )
    return [
      { key: 'rings', label: 'Rings', build: polarShare },
      { key: 'treemap', label: 'Treemap', build: treemap },
      { key: 'sunburst', label: 'Sunburst', build: sunburst },
    ];
  if (chart && chart.series.length > 2)
    return [
      { key: 'flow', label: 'Flow', build: sankey },
      { key: 'sunburst', label: 'Sunburst', build: sunburst },
      { key: 'heatmap', label: 'Heatmap', build: heatmap },
      { key: 'treemap', label: 'Treemap', build: treemap },
    ];
  return [
    { key: 'radial', label: 'Radial', build: radial },
    { key: 'cumulative', label: 'Cumulative', build: cumulative },
    { key: 'bars', label: 'Bars', build: bars },
  ];
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 28 - ((value - min) / (max - min || 1)) * 26;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full">
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

function Ticker({ kpis, money }: { kpis: Kpi[]; money: Money }) {
  const items = [...kpis, ...kpis, ...kpis, ...kpis];
  return (
    <div className="relative overflow-hidden border-y border-cyan-400/20 bg-cyan-400/[0.03] py-2 font-mono text-xs">
      <motion.div
        className="flex w-max gap-10 whitespace-nowrap"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      >
        {items.map((kpi, index) => (
          <span key={`${kpi.id}-${index}`} className="flex items-center gap-2">
            <span className="text-cyan-200/50">{kpi.label.toUpperCase()}</span>
            <span className="text-cyan-100">{money.whole(kpi.value)}</span>
            {kpi.momentum !== null && (
              <span style={{ color: kpi.momentum >= 0 ? LIME : PINK }}>
                {kpi.momentum >= 0 ? '▲' : '▼'}
                {Math.abs(Math.round(kpi.momentum * 100))}%
              </span>
            )}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-4 w-4 border-cyan-300 ${className}`}
    />
  );
}

function Stage({ widget, money }: { widget: ProtoWidget; money: Money }) {
  const router = useRouter();
  const lenses = lensesFor(widget);
  const [lensKey, setLensKey] = useState(lenses[0]!.key);
  const lens = lenses.find((item) => item.key === lensKey) ?? lenses[0]!;
  const option = lens.build(widget, money);
  const insights = insightsOf(widget, money.whole);
  return (
    <div className="relative flex min-h-[640px] flex-col border border-cyan-400/20 bg-[#06101d]/80 p-5">
      <Corner className="left-0 top-0 border-l-2 border-t-2" />
      <Corner className="right-0 top-0 border-r-2 border-t-2" />
      <Corner className="bottom-0 left-0 border-b-2 border-l-2" />
      <Corner className="bottom-0 right-0 border-b-2 border-r-2" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-cyan-300/60">
            {'// focus'}
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-white">{widget.name}</h2>
          {widget.data?.total != null && (
            <button
              type="button"
              onClick={() => router.push(widget.data!.hrefs.total)}
              className="mt-1 font-mono text-4xl text-cyan-300 [text-shadow:0_0_24px_rgba(0,240,255,.6)]"
            >
              <NumberFlow
                value={money.major(widget.data.total)}
                format={CHF_FORMAT}
                locales="de-CH"
              />
            </button>
          )}
        </div>
        <div
          role="tablist"
          className="flex gap-1 rounded-full border border-cyan-400/25 p-1 font-mono text-xs"
        >
          {lenses.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === lens.key}
              onClick={() => setLensKey(item.key)}
              className="relative rounded-full px-3 py-1.5 text-cyan-100/70"
            >
              {item.key === lens.key && (
                <motion.span
                  layoutId="lens-pill"
                  className="absolute inset-0 rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(0,240,255,.7)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className={`relative ${item.key === lens.key ? 'text-[#03111c]' : ''}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-4 min-h-[440px] flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${widget.id}-${lens.key}`}
            initial={{ opacity: 0, scale: 0.97, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
          >
            {option ? (
              <EChart option={option} className="h-full w-full" />
            ) : (
              <p className="text-cyan-200/50">No data.</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight, index) => (
          <motion.div
            key={`${widget.id}-${insight.headline}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.08 }}
            className="border-l-2 border-cyan-300/60 bg-cyan-300/[0.04] px-3 py-2"
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-200/50">
              {insight.headline}
            </div>
            <div className="font-mono text-sm text-white">{insight.detail}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function VariantCockpit({ dashboardName, widgets }: ProtoProps) {
  const money = useMoney();
  const [selectedId, setSelectedId] = useState(widgets[widgets.length > 2 ? 2 : 0]?.id);
  const selected = widgets.find((widget) => widget.id === selectedId) ?? widgets[0];
  const kpis = heroKpisOf(widgets);
  return (
    <div className="relative -mx-2 overflow-hidden rounded-xl bg-[#030812] text-cyan-50 md:-mx-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 0%, rgba(0,240,255,.25), transparent 40%), radial-gradient(circle at 90% 100%, rgba(255,43,214,.2), transparent 40%), repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 3px)',
        }}
      />
      <div className="relative flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <motion.span
            className="h-3 w-3 rounded-full bg-cyan-300"
            animate={{ boxShadow: ['0 0 0 0 rgba(0,240,255,.7)', '0 0 0 12px rgba(0,240,255,0)'] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          <h1 className="font-mono text-lg uppercase tracking-[0.35em] text-cyan-100">
            {dashboardName}
          </h1>
        </div>
        <span className="font-mono text-xs text-cyan-200/50">
          SYS.OK · CHF · {widgets.length} feeds
        </span>
      </div>
      <Ticker kpis={kpis} money={money} />
      <div className="relative grid gap-4 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Widgets" className="flex flex-col gap-2">
          {widgets.map((widget, index) => {
            const kpi = kpiOf(widget);
            const isActive = widget.id === selected?.id;
            const color = HUD[index % HUD.length]!;
            return (
              <motion.button
                key={widget.id}
                type="button"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                whileHover={{ x: 4 }}
                onClick={() => setSelectedId(widget.id)}
                className={`relative overflow-hidden border px-3 py-3 text-left transition-colors ${isActive ? 'border-cyan-300 bg-cyan-300/10' : 'border-cyan-400/15 bg-white/[0.02] hover:border-cyan-400/40'}`}
              >
                {isActive && (
                  <motion.span
                    layoutId="rail-active"
                    className="absolute inset-y-0 left-0 w-1 bg-cyan-300 shadow-[0_0_14px_rgba(0,240,255,.9)]"
                  />
                )}
                <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-200/50">
                  F{String(index + 1).padStart(2, '0')} · {widget.visualisation.replace('_', ' ')}
                </div>
                <div className="mt-0.5 text-sm font-medium text-white">{widget.name}</div>
                {kpi && (
                  <div className="font-mono text-xs" style={{ color }}>
                    {money.whole(kpi.value)}
                  </div>
                )}
                {kpi && <Sparkline values={kpi.trend} color={color} />}
              </motion.button>
            );
          })}
        </nav>
        {selected && <Stage key={selected.id} widget={selected} money={money} />}
      </div>
    </div>
  );
}
