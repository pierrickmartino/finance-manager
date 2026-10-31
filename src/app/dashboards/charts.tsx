'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFormatter } from '@/components/formatter-provider';
import {
  toDonutSlices,
  toSeriesChart,
  toSingleNumber,
  type ChartSource,
  type SeriesChart,
} from '@/lib/reporting/chart-data';
import type { Measure } from '@/server/services/reporting';
import { useChartPalette, type ChartPalette } from './chart-palette';

/** Formats a chart value: CHF for sums and averages, a plain count otherwise. */
function useValueFormat(measure: Measure) {
  const fmt = useFormatter();
  return {
    value: (value: number) =>
      measure === 'count' ? String(value) : fmt.amount(value, { currency: 'CHF' }),
    tick: (value: number) =>
      measure === 'count' ? String(value) : fmt.amount(value, { isWhole: true }),
  };
}

/** Recharts rows: the x label plus one value per series key. */
function rechartsRows(chart: SeriesChart): Record<string, string | number | null>[] {
  return chart.points.map((point) => ({ label: point.label, ...point.values }));
}

function axisProps(palette: ChartPalette) {
  return {
    tick: { fill: palette.text, fontSize: 12 },
    stroke: palette.grid,
    tickLine: false,
  };
}

function Empty() {
  return <p className="text-sm text-zinc-500">No data in this date range yet.</p>;
}

function tooltipStyle(palette: ChartPalette) {
  return {
    contentStyle: {
      background: palette.surface,
      border: `1px solid ${palette.grid}`,
      borderRadius: 6,
      fontSize: 12,
    },
    labelStyle: { color: palette.text },
  };
}

interface ChartProps {
  data: ChartSource;
  title: string;
}

/** Line: one 2px line per series over the rows (periods); each dot drills down. */
export function LineWidgetChart({ data, title }: ChartProps) {
  const router = useRouter();
  const palette = useChartPalette();
  const format = useValueFormat(data.measure);
  const chart = toSeriesChart(data);
  if (chart.points.length === 0) return <Empty />;
  return (
    <figure aria-label={`${title} line chart`} className="h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rechartsRows(chart)} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps(palette)} />
          <YAxis tickFormatter={format.tick} width={72} {...axisProps(palette)} />
          <ReferenceLine y={0} stroke={palette.text} strokeOpacity={0.4} />
          <Tooltip formatter={(value) => format.value(Number(value))} {...tooltipStyle(palette)} />
          {chart.series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 12, color: palette.text }} />
          )}
          {chart.series.map((series) => (
            <Line
              key={series.key}
              dataKey={series.key}
              name={series.label}
              stroke={palette.series[series.slot]}
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
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
                      r={4}
                      fill={palette.series[series.slot]}
                      stroke={palette.surface}
                      strokeWidth={2}
                    />
                  </g>
                );
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Stacked bar: one bar per row, one stacked segment per series; each segment drills down. */
export function StackedBarWidgetChart({ data, title }: ChartProps) {
  const router = useRouter();
  const palette = useChartPalette();
  const format = useValueFormat(data.measure);
  const chart = toSeriesChart(data);
  if (chart.points.length === 0) return <Empty />;
  return (
    <figure aria-label={`${title} stacked bar chart`} className="h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rechartsRows(chart)}
          stackOffset="sign"
          margin={{ top: 8, right: 12, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps(palette)} />
          <YAxis tickFormatter={format.tick} width={72} {...axisProps(palette)} />
          <ReferenceLine y={0} stroke={palette.text} strokeOpacity={0.4} />
          <Tooltip
            formatter={(value) => format.value(Number(value))}
            cursor={{ fill: palette.grid, fillOpacity: 0.4 }}
            {...tooltipStyle(palette)}
          />
          {chart.series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 12, color: palette.text }} />
          )}
          {chart.series.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              stackId="stack"
              fill={palette.series[series.slot]}
              stroke={palette.surface}
              strokeWidth={1}
              isAnimationActive={false}
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
  );
}

/** Donut: the parts of the total; each slice drills down. Sized by magnitude. */
export function DonutWidgetChart({ data, title }: ChartProps) {
  const router = useRouter();
  const palette = useChartPalette();
  const format = useValueFormat(data.measure);
  const slices = toDonutSlices(data);
  if (slices.length === 0) return <Empty />;
  return (
    <figure aria-label={`${title} donut chart`} className="h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            formatter={(_value, _name, item) =>
              format.value(Number((item.payload as { signedValue: number }).signedValue))
            }
            {...tooltipStyle(palette)}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ fontSize: 12, color: palette.text }}
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1}
            stroke={palette.surface}
            strokeWidth={2}
            isAnimationActive={false}
            onClick={(_item, index) => {
              const href = slices[index]?.href;
              if (href) router.push(href);
            }}
          >
            {slices.map((slice) => (
              <Cell
                key={slice.label}
                fill={palette.series[slice.slot]}
                className={slice.href ? 'cursor-pointer' : undefined}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Single number: the grand total, as a link to its Transactions. */
export function SingleNumberWidget({ data, title }: ChartProps) {
  const format = useValueFormat(data.measure);
  const { value, href } = toSingleNumber(data);
  return (
    <div className="flex h-full flex-col justify-center">
      {value === null ? (
        <span className="text-3xl text-zinc-400">—</span>
      ) : (
        <Link
          href={href}
          aria-label={`${title}: ${format.value(value)}`}
          className="text-3xl font-semibold tabular-nums hover:underline"
        >
          {format.value(value)}
        </Link>
      )}
    </div>
  );
}
