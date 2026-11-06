'use client';

/**
 * PROTOTYPE (throwaway) — Variant D "Tide" (light only). The year as one river: income flows
 * above the waterline, every spending Category below it. Scrubbing along the river drives the
 * month's readout (earned, spent, kept) and "where it went". Glacier-lake palette.
 */
import '@fontsource-variable/bricolage-grotesque/wdth.css';
import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { EChart, echarts, type EChartsOption } from './echart';
import { monthlyFlowOf, slicesOf, splitPath, type MonthlyFlow, type ProtoProps } from './data';
import { CHF_FORMAT, useMoney, type Money } from './money';

const LAKE = {
  paper: '#f6f9fb',
  ink: '#0d2b45',
  soft: '#5b7186',
  line: '#d7e3ec',
  income: '#14967f',
};
/** Spending, from deep water to evening sky. */
const OUT = [
  '#0d3b66',
  '#2f6690',
  '#5b93bd',
  '#8fbfe0',
  '#b9b3e3',
  '#9381c4',
  '#e8a39b',
  '#d9776b',
];
const FONT = { fontFamily: '"Bricolage Grotesque Variable", ui-sans-serif, system-ui' };

function riverOption(flow: MonthlyFlow): EChartsOption {
  return {
    textStyle: FONT,
    grid: { left: 0, right: 0, top: 10, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      showContent: false,
      axisPointer: {
        type: 'line',
        snap: true,
        lineStyle: { color: LAKE.ink, width: 2 },
        label: { show: false },
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: flow.months.map((month) => month.split(' ')[0]),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: LAKE.soft, fontSize: 12, ...FONT },
    },
    yAxis: { type: 'value', show: false },
    animationDuration: 1800,
    animationEasing: 'cubicInOut',
    series: [
      {
        type: 'line',
        name: 'Income',
        stack: 'in',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { width: 0 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#0f7f6c' },
            { offset: 1, color: '#3cc2a6' },
          ]),
        },
        data: flow.income,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: LAKE.paper, width: 3, type: 'solid' },
          label: { show: false },
          data: [{ yAxis: 0 }],
        },
      },
      ...flow.spending.slice(0, OUT.length).map((item, index) => ({
        type: 'line',
        name: item.label,
        stack: 'out',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { width: 0 },
        areaStyle: { color: OUT[index], opacity: 0.95 },
        data: item.values.map((value) => -value),
      })),
    ],
  };
}

function Readout({ flow, index, money }: { flow: MonthlyFlow; index: number; money: Money }) {
  const earned = flow.income[index] ?? 0;
  const spent = flow.spending.reduce((sum, item) => sum + (item.values[index] ?? 0), 0);
  const kept = earned - spent;
  const keptShare = earned > 0 ? Math.max(0, kept / earned) : 0;
  const month = flow.months[index] ?? '';
  return (
    <div className="grid gap-x-10 gap-y-4 md:grid-cols-[1.3fr_1fr_1fr_1.4fr] md:items-end">
      <div>
        <p className="text-sm" style={{ color: LAKE.soft }}>
          Scrub the river to read a month
        </p>
        <motion.p
          key={month}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-semibold tracking-tight md:text-5xl"
          style={{ fontStretch: '75%' }}
        >
          {month}
        </motion.p>
      </div>
      <Figure label="Came in" value={money.major(earned)} color={LAKE.income} />
      <Figure label="Went out" value={money.major(spent)} color={OUT[1]!} />
      <div>
        <Figure
          label={kept >= 0 ? 'Stayed' : 'Drawn from savings'}
          value={money.major(kept)}
          color={LAKE.ink}
        />
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: LAKE.line }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: LAKE.income }}
            animate={{ width: `${keptShare * 100}%` }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
          />
        </div>
        <p className="mt-1 text-xs" style={{ color: LAKE.soft }}>
          {Math.round(keptShare * 100)}% of what came in
        </p>
      </div>
    </div>
  );
}

function Figure({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm" style={{ color: LAKE.soft }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </p>
      <p className="text-3xl font-semibold tabular-nums tracking-tight">
        <NumberFlow value={value} format={CHF_FORMAT} locales="de-CH" />
      </p>
    </div>
  );
}

function WhereItWent({ flow, index, money }: { flow: MonthlyFlow; index: number; money: Money }) {
  const items = flow.spending
    .slice(0, OUT.length)
    .map((item, slot) => ({ label: item.label, value: item.values[index] ?? 0, color: OUT[slot]! }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <section>
      <h2 className="text-xl font-semibold">Where {flow.months[index]?.split(' ')[0]} went</h2>
      <ul className="mt-4 flex flex-col gap-2.5">
        {items.map((item) => {
          const [group, name] = splitPath(item.label);
          return (
            <motion.li
              layout
              key={item.label}
              className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3 text-sm"
            >
              <span className="truncate">
                {name}
                {group !== name && <span style={{ color: LAKE.soft }}> in {group}</span>}
              </span>
              <span className="h-3 overflow-hidden rounded-full" style={{ background: LAKE.line }}>
                <motion.span
                  className="block h-full rounded-full"
                  style={{ background: item.color }}
                  animate={{ width: `${(item.value / max) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                />
              </span>
              <span className="text-right tabular-nums">{money.whole(item.value)}</span>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

/** Accounts as reservoirs: each filled to its share of the largest. */
function Reservoirs({ props, money }: { props: ProtoProps; money: Money }) {
  const balances = props.widgets.find((widget) => widget.source === 'account_balances');
  const slices = balances ? slicesOf(balances).sort((a, b) => b.value - a.value) : [];
  if (slices.length === 0) return null;
  const max = Math.max(...slices.map((slice) => slice.value));
  const total = slices.reduce((sum, slice) => sum + slice.signedValue, 0);
  return (
    <section>
      <h2 className="text-xl font-semibold">
        In the reservoirs{' '}
        <span className="font-normal" style={{ color: LAKE.soft }}>
          {money.whole(total)}
        </span>
      </h2>
      <div className="mt-4 flex h-52 items-end gap-4">
        {slices.map((slice, index) => (
          <div key={slice.label} className="flex h-full flex-1 flex-col items-center gap-2">
            <div
              className="relative w-full flex-1 overflow-hidden rounded-2xl border-2"
              style={{ borderColor: LAKE.line, background: '#fff' }}
            >
              <motion.div
                className="absolute inset-x-0 bottom-0"
                style={{ background: index === 0 ? LAKE.income : OUT[index + 1] }}
                initial={{ height: 0 }}
                animate={{ height: `${(slice.value / max) * 100}%` }}
                transition={{ duration: 1.6, delay: 0.4 + index * 0.15, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="text-center text-xs leading-tight">
              <span className="block font-medium">{slice.label.split(' · ').pop()}</span>
              <span className="tabular-nums" style={{ color: LAKE.soft }}>
                {money.compact(slice.value)}
              </span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function VariantTide(props: ProtoProps) {
  const money = useMoney();
  const flow = useMemo(() => monthlyFlowOf(props.widgets), [props.widgets]);
  const [index, setIndex] = useState(() => (flow ? flow.months.length - 1 : 0));
  const option = useMemo(() => (flow ? riverOption(flow) : null), [flow]);
  return (
    <div
      className="-mx-2 rounded-[20px] px-6 py-10 md:-mx-4 md:px-12"
      style={{ background: LAKE.paper, color: LAKE.ink, colorScheme: 'light', ...FONT }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1
          className="text-6xl font-bold tracking-tight md:text-7xl"
          style={{ fontStretch: '75%' }}
        >
          {props.dashboardName}
        </h1>
        <p className="max-w-sm text-base" style={{ color: LAKE.soft }}>
          Twelve months of money through your household. Above the line it arrives, below it leaves.
        </p>
      </header>
      {flow && option ? (
        <>
          <div className="mt-10">
            <Readout flow={flow} index={index} money={money} />
          </div>
          <div className="relative mt-6">
            <div className="relative">
              <EChart
                option={option}
                onAxisIndex={setIndex}
                className="h-[440px] w-full cursor-ew-resize"
              />
              {/* The scrubbed month stays marked when the pointer leaves the river. */}
              <motion.div
                aria-hidden
                className="pointer-events-none absolute bottom-7 top-2 w-0.5 rounded-full"
                style={{ background: LAKE.ink }}
                animate={{ left: `${(index / Math.max(1, flow.months.length - 1)) * 100}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <span
                  className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2"
                  style={{ background: LAKE.paper, borderColor: LAKE.ink }}
                />
              </motion.div>
            </div>
            <Legend flow={flow} />
          </div>
          <div className="mt-12 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
            <WhereItWent flow={flow} index={index} money={money} />
            <Reservoirs props={props} money={money} />
          </div>
        </>
      ) : (
        <p className="mt-10">
          This view needs an income-vs-expense Widget and a spending-by-Category Widget on the
          Dashboard.
        </p>
      )}
    </div>
  );
}

function Legend({ flow }: { flow: MonthlyFlow }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: LAKE.soft }}>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LAKE.income }} />
        Income
      </li>
      {flow.spending.slice(0, OUT.length).map((item, index) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT[index] }} />
          {splitPath(item.label)[1]}
        </li>
      ))}
    </ul>
  );
}
