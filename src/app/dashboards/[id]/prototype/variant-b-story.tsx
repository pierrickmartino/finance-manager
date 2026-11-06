'use client';

/**
 * PROTOTYPE (throwaway) — Variant B "Story": an editorial, scroll-driven narrative. A giant
 * hero number, then one numbered chapter per Widget that reveals itself as you scroll, with a
 * plain-language headline, ink-and-vermilion charts and typographic bars instead of legends.
 */
import NumberFlow from '@number-flow/react';
import { motion, useInView, useScroll, useSpring, useTransform } from 'motion/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EChart, echarts, type EChartsOption } from './echart';
import {
  insightsOf,
  kpiOf,
  savingsRateOf,
  seriesOf,
  seriesTotals,
  slicesOf,
  splitPath,
  type ProtoProps,
  type ProtoWidget,
} from './data';
import { CHF_FORMAT, useMoney, type Money } from './money';
import { APP, VARIANT_ROOT_STYLE } from './theme';

const INK = APP.ink;
const ACCENT = '#ff4f1f';
const PAPER = APP.bg;
const MUTED = APP.muted;
const SERIF = 'font-[ui-serif,Georgia,Cambria,"Times_New_Roman",serif]';

function inkAxes(labels: string[], money: Money) {
  return {
    grid: { left: 0, right: 70, top: 20, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: labels.map((label) => label.split(' ')[0]),
      axisLine: { lineStyle: { color: INK } },
      axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: 'rgba(22,19,15,0.08)', type: 'dashed' as const } },
      axisLabel: { color: MUTED, fontSize: 11, formatter: (value: number) => money.compact(value) },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: INK,
      borderWidth: 0,
      textStyle: { color: PAPER },
      valueFormatter: (value: unknown) => money.whole(Number(value)),
    },
  };
}

function storyLine(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  return {
    ...inkAxes(
      chart.points.map((point) => point.label),
      money,
    ),
    animationDuration: 2600,
    series: chart.series.map((series) => ({
      type: 'line',
      name: series.label,
      data: chart.points.map((point) => point.values[series.key]),
      smooth: false,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2.5, color: INK },
      itemStyle: { color: PAPER, borderColor: INK, borderWidth: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(255,79,31,0.35)' },
          { offset: 1, color: 'rgba(255,79,31,0)' },
        ]),
      },
      endLabel: {
        show: true,
        color: ACCENT,
        fontWeight: 'bold',
        fontSize: 13,
        formatter: (p: { value?: unknown }) => money.compact(Number(p.value)),
      },
      markArea: {
        silent: true,
        itemStyle: { color: 'rgba(22,19,15,0.04)' },
        data: [[{ yAxis: 'min' }, { yAxis: 0 }]],
      },
    })),
  };
}

function storyBars(widget: ProtoWidget, money: Money): EChartsOption | null {
  const chart = seriesOf(widget);
  if (!chart) return null;
  const colors = [INK, ACCENT, '#8a8172', '#c9b99a'];
  return {
    ...inkAxes(
      chart.points.map((point) => point.label),
      money,
    ),
    legend: {
      top: 0,
      right: 0,
      icon: 'rect',
      itemWidth: 14,
      itemHeight: 4,
      textStyle: { color: INK },
    },
    grid: { left: 0, right: 8, top: 36, bottom: 0, containLabel: true },
    animationDuration: 1200,
    animationDelay: (index: number) => index * 90,
    series: chart.series.map((series, index) => ({
      type: 'bar',
      name: series.label,
      stack: 'total',
      barWidth: 14,
      data: chart.points.map((point) => point.values[series.key]),
      itemStyle: { color: colors[index % colors.length] },
    })),
  };
}

/** Category totals as giant typographic bars that grow when they come into view. */
function RankedBars({ widget, money }: { widget: ProtoWidget; money: Money }) {
  const chart = seriesOf(widget);
  const ref = useRef<HTMLOListElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-15% 0px' });
  if (!chart) return null;
  const totals = seriesTotals(chart).slice(0, 7);
  const max = Math.max(...totals.map((item) => Math.abs(item.value)));
  return (
    <ol ref={ref} className="flex flex-col gap-4">
      {totals.map((item, index) => {
        const [group, name] = splitPath(item.label);
        return (
          <li key={item.label} className="grid grid-cols-[2.5rem_1fr] items-center gap-3">
            <span className={`${SERIF} text-2xl italic`} style={{ color: MUTED }}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <span className={`${SERIF} text-2xl md:text-3xl`}>
                  {name}
                  {group !== name && (
                    <span
                      className="ml-2 text-xs uppercase tracking-widest"
                      style={{ color: MUTED }}
                    >
                      {group}
                    </span>
                  )}
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {money.whole(Math.abs(item.value))}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/5">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: index === 0 ? ACCENT : INK }}
                  initial={{ width: 0 }}
                  animate={{ width: isInView ? `${(Math.abs(item.value) / max) * 100}%` : 0 }}
                  transition={{ duration: 1.4, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Balances as one proportional band, like a printed infographic. */
function ShareBand({ widget, money }: { widget: ProtoWidget; money: Money }) {
  const slices = slicesOf(widget).sort((a, b) => b.value - a.value);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-15% 0px' });
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const tones = [INK, ACCENT, '#8a8172', '#c9b99a', '#5b544a'];
  return (
    <div ref={ref}>
      <div className="flex h-24 w-full gap-1 overflow-hidden rounded-xl">
        {slices.map((slice, index) => (
          <motion.div
            key={slice.label}
            className="h-full first:rounded-l-xl last:rounded-r-xl"
            style={{ background: tones[index % tones.length] }}
            initial={{ flexGrow: 0.0001 }}
            animate={{ flexGrow: isInView ? slice.value / total : 0.0001 }}
            transition={{ duration: 1.6, delay: index * 0.15, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <dl className="mt-6 grid gap-6 sm:grid-cols-3">
        {slices.map((slice, index) => (
          <div
            key={slice.label}
            className="border-t-2 pt-3"
            style={{ borderColor: tones[index % tones.length] }}
          >
            <dt className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>
              {slice.label}
            </dt>
            <dd className={`${SERIF} mt-1 text-3xl`}>{Math.round((slice.value / total) * 100)}%</dd>
            <dd className="font-mono text-sm">{money.whole(slice.signedValue)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ChapterChart({ widget, money }: { widget: ProtoWidget; money: Money }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-20% 0px' });
  const option = useMemo(
    () => (widget.visualisation === 'line' ? storyLine(widget, money) : storyBars(widget, money)),
    [widget, money],
  );
  const chart = seriesOf(widget);
  if (
    widget.source === 'account_balances' ||
    widget.visualisation === 'table' ||
    widget.visualisation === 'donut'
  )
    return <ShareBand widget={widget} money={money} />;
  if (chart && chart.series.length > 2) return <RankedBars widget={widget} money={money} />;
  return (
    <div ref={ref} className="h-80">
      {isInView && option && <EChart option={option} className="h-full w-full" />}
    </div>
  );
}

function Chapter({ widget, index, money }: { widget: ProtoWidget; index: number; money: Money }) {
  const insights = insightsOf(widget, money.whole);
  const [lead, ...rest] = insights;
  return (
    <motion.section
      initial={{ opacity: 0, y: 80 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="grid gap-10 border-t py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      style={{ borderColor: 'rgba(22,19,15,0.15)' }}
    >
      <div className={index % 2 === 1 ? 'lg:order-2' : ''}>
        <div
          className="flex items-center gap-3 text-xs uppercase tracking-[0.3em]"
          style={{ color: MUTED }}
        >
          <span className={`${SERIF} text-6xl italic leading-none`} style={{ color: ACCENT }}>
            {String(index + 1).padStart(2, '0')}
          </span>
          Chapter · {widget.name}
        </div>
        {lead && (
          <h2 className={`${SERIF} mt-6 text-4xl leading-[1.05] tracking-tight md:text-5xl`}>
            {lead.headline}
            <span className="mt-2 block" style={{ color: ACCENT }}>
              {lead.detail}
            </span>
          </h2>
        )}
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4">
          {rest.map((insight) => (
            <div key={insight.headline}>
              <dt className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>
                {insight.headline}
              </dt>
              <dd className="font-mono text-lg tabular-nums">{insight.detail}</dd>
            </div>
          ))}
        </dl>
        {widget.data && (
          <Link
            href={widget.data.hrefs.total}
            className="mt-8 inline-block text-sm underline underline-offset-4"
          >
            See the Transactions →
          </Link>
        )}
      </div>
      <div className={`self-center ${index % 2 === 1 ? 'lg:order-1' : ''}`}>
        <ChapterChart widget={widget} money={money} />
      </div>
    </motion.section>
  );
}

function Hero({ dashboardName, widgets, money }: ProtoProps & { money: Money }) {
  const balances = widgets.find((widget) => widget.source === 'account_balances');
  const heroKpi = kpiOf(balances ?? widgets[0]!);
  const flowWidget = widgets.find((widget) => savingsRateOf(widget) !== null);
  const rate = flowWidget ? savingsRateOf(flowWidget) : null;
  const [income, expense] = flowWidget?.data
    ? [
        Math.max(...(flowWidget.data.columnTotals as number[])),
        Math.min(...(flowWidget.data.columnTotals as number[])),
      ]
    : [0, 0];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setShown(heroKpi ? money.major(heroKpi.value) : 0), 300);
    return () => clearTimeout(timer);
  }, [heroKpi, money]);

  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <motion.div
      ref={ref}
      style={{ y, opacity }}
      className="flex min-h-[78vh] flex-col justify-center py-16"
    >
      <motion.p
        initial={{ opacity: 0, letterSpacing: '0.6em' }}
        animate={{ opacity: 1, letterSpacing: '0.3em' }}
        transition={{ duration: 1.2 }}
        className="text-xs uppercase"
        style={{ color: MUTED }}
      >
        {dashboardName} · your last twelve months
      </motion.p>
      <h1
        className={`${SERIF} mt-6 text-[clamp(3.5rem,11vw,9.5rem)] leading-[0.9] tracking-[-0.04em]`}
      >
        <NumberFlow value={shown} format={CHF_FORMAT} locales="de-CH" />
      </h1>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.4, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mt-4 h-1.5 w-48 origin-left rounded-full"
        style={{ background: ACCENT }}
      />
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 1 }}
        className={`${SERIF} mt-8 max-w-3xl text-2xl leading-snug md:text-3xl`}
      >
        {balances ? 'Your net worth today.' : `${heroKpi?.label ?? 'Total'}.`}{' '}
        {rate !== null && (
          <>
            You brought in <b>{money.whole(income)}</b>, spent{' '}
            <b>{money.whole(Math.abs(expense))}</b>, and kept{' '}
            <span className="rounded px-1.5" style={{ background: ACCENT, color: PAPER }}>
              {Math.round(rate * 100)}%
            </span>{' '}
            of it.
          </>
        )}
      </motion.p>
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="mt-16 text-xs uppercase tracking-[0.3em]"
        style={{ color: MUTED }}
      >
        Scroll to read the story ↓
      </motion.div>
    </motion.div>
  );
}

export function VariantStory(props: ProtoProps) {
  const money = useMoney();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <div
      className="relative -mx-2 rounded-[28px] px-6 md:-mx-4 md:px-14"
      style={VARIANT_ROOT_STYLE}
    >
      <motion.div
        className="fixed inset-x-0 top-0 z-50 h-1 origin-left"
        style={{ scaleX: progress, background: ACCENT }}
      />
      <Hero {...props} money={money} />
      {props.widgets.map((widget, index) => (
        <Chapter key={widget.id} widget={widget} index={index} money={money} />
      ))}
      <footer
        className={`${SERIF} border-t py-16 text-center text-3xl italic`}
        style={{ borderColor: 'rgba(22,19,15,0.15)' }}
      >
        Fin.
      </footer>
    </div>
  );
}
