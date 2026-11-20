'use client';

import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFormatter } from '@/components/formatter-provider';
import { CHART_PALETTE } from '../dashboards/chart-palette';

/** One period's bar: its axis label, and whether it is the current period, drawn "to date". */
export interface SpendingChartPeriod {
  label: string;
  isToDate: boolean;
}

/** One stacked series, its colour and a segment per period (signed CHF minor units). */
export interface SpendingChartSeries {
  key: string;
  label: string;
  color: string;
  cells: { value: number | null; href: string }[];
}

interface SpendingChartProps {
  name: string;
  periods: SpendingChartPeriod[];
  series: SpendingChartSeries[];
}

/** The current period's bar is lighter and outlined dashed, so it never reads as a weak one. */
const TO_DATE_OPACITY = 0.45;

/**
 * Spending by Category as one stacked bar per period. Spending is drawn upwards (a refund that
 * outweighs its Category's spending goes below zero); the tooltip gives amounts as booked.
 * Each segment opens its Drill-down.
 */
export function SpendingChart({ name, periods, series }: SpendingChartProps) {
  const router = useRouter();
  const fmt = useFormatter();
  const palette = CHART_PALETTE;
  const slot = (index: number) => `s${index}`;
  const rows = periods.map((period, p) => ({
    label: period.isToDate ? `${period.label} to date` : period.label,
    ...Object.fromEntries(
      series.map((entry, s) => {
        const value = entry.cells[p]?.value ?? null;
        return [slot(s), value === null ? null : -value];
      }),
    ),
  }));
  const axis = {
    tick: { fill: palette.text, fontSize: 12 },
    stroke: palette.grid,
    tickLine: false,
  };
  return (
    <figure aria-label={`${name} stacked bar chart`} className="h-72 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis
            tickFormatter={(value: number) => fmt.amount(value, { isWhole: true })}
            width={72}
            {...axis}
          />
          <ReferenceLine y={0} stroke={palette.text} strokeOpacity={0.4} />
          <Tooltip
            formatter={(value) => fmt.amount(-Number(value), { currency: 'CHF' })}
            cursor={{ fill: palette.grid, fillOpacity: 0.4 }}
            contentStyle={{
              background: palette.surface,
              border: `1px solid ${palette.grid}`,
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: palette.text }}
          />
          {series.map((entry, s) => (
            <Bar
              key={entry.key}
              dataKey={slot(s)}
              name={entry.label}
              stackId="spending"
              fill={entry.color}
              stroke={palette.surface}
              strokeWidth={1}
              isAnimationActive={false}
              className="cursor-pointer"
              onClick={(_item, index) => {
                const href = entry.cells[index]?.href;
                if (href) router.push(href);
              }}
            >
              {periods.map((period, p) => (
                <Cell
                  key={p}
                  fillOpacity={period.isToDate ? TO_DATE_OPACITY : 1}
                  stroke={period.isToDate ? entry.color : palette.surface}
                  strokeDasharray={period.isToDate ? '3 2' : undefined}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
