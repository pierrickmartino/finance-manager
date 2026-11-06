/**
 * PROTOTYPE (throwaway): shared data shaping for the dashboard visualisation variants.
 * Question: "What should the Dashboard look like to make the user go WAOUH?"
 * Three variants on the existing /dashboards/[id] route, switchable via `?variant=`.
 * See ./variants.tsx. Delete this folder once a variant has won.
 */
import {
  toDonutSlices,
  toSeriesChart,
  type ChartSource,
  type DonutSlice,
  type SeriesChart,
} from '@/lib/reporting/chart-data';
import type { Visualisation, WidgetSource } from '@/server/services/reporting';

export interface ProtoWidget {
  id: string;
  name: string;
  source: WidgetSource;
  visualisation: Visualisation;
  data: ChartSource | null;
  error: string | null;
}

export interface ProtoProps {
  dashboardName: string;
  widgets: ProtoWidget[];
}

export interface Kpi {
  id: string;
  label: string;
  value: number;
  /** The row totals in order (e.g. per month), for a sparkline. */
  trend: number[];
  /** Change of the last full point versus the average of the others, as a ratio. */
  momentum: number | null;
  href: string;
}

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function kpiOf(widget: ProtoWidget): Kpi | null {
  const data = widget.data;
  if (!data || !isNumber(data.total)) return null;
  const trend = data.rowTotals.map((value) => value ?? 0);
  const isTimeSeries = widget.source === 'query' && trend.length > 2;
  const momentum = isTimeSeries ? momentumOf(trend) : null;
  return {
    id: widget.id,
    label: widget.name,
    value: data.total,
    trend: isTimeSeries ? trend : [],
    momentum,
    href: data.hrefs.total,
  };
}

export function seriesOf(widget: ProtoWidget): SeriesChart | null {
  if (!widget.data || widget.data.rows.length === 0) return null;
  return toSeriesChart(widget.data);
}

export function slicesOf(widget: ProtoWidget): DonutSlice[] {
  return widget.data ? toDonutSlices(widget.data) : [];
}

/** Per-series totals across all points (e.g. per Category over 12 months). */
export function seriesTotals(chart: SeriesChart): { label: string; value: number; slot: number }[] {
  return chart.series
    .map((series) => ({
      label: series.label,
      slot: series.slot,
      value: chart.points.reduce((sum, point) => sum + (point.values[series.key] ?? 0), 0),
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/** "Living › Groceries" → ["Living", "Groceries"]. */
export function splitPath(label: string): [string, string] {
  const [group, ...rest] = label.split(' › ');
  return rest.length ? [group!, rest.join(' › ')] : [label, label];
}

export interface Insight {
  headline: string;
  detail: string;
}

/** Plain-language observations a variant can show next to a chart. */
export function insightsOf(widget: ProtoWidget, money: (value: number) => string): Insight[] {
  const chart = widget.source === 'account_balances' ? null : seriesOf(widget);
  if (!chart || chart.points.length === 0) {
    const slices = slicesOf(widget);
    if (slices.length === 0) return [];
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    const top = [...slices].sort((a, b) => b.value - a.value)[0]!;
    return [
      {
        headline: `${Math.round((top.value / total) * 100)}% sits in ${top.label}`,
        detail: `${money(top.signedValue)} of ${money(total)}`,
      },
    ];
  }
  const totals = chart.points.map((point) =>
    Object.values(point.values).reduce<number>((sum, value) => sum + (value ?? 0), 0),
  );
  // Spending is negative: rank by magnitude so "heaviest" means the most spent.
  const isOutflow = totals.every((value) => value <= 0);
  const ranked = isOutflow ? totals.map(Math.abs) : totals;
  const maxIndex = ranked.indexOf(Math.max(...ranked));
  const minIndex = ranked.indexOf(Math.min(...ranked.filter((value) => !isOutflow || value > 0)));
  const avg = totals.reduce((sum, value) => sum + value, 0) / totals.length;
  const isNet = chart.series.length === 2 || widget.visualisation === 'line';
  const [top, low] = isOutflow
    ? ['Heaviest month', 'Lightest month']
    : isNet
      ? ['Best net month', 'Weakest month']
      : ['Peak', 'Low'];
  const insights: Insight[] = [
    { headline: `${top}: ${chart.points[maxIndex]!.label}`, detail: money(totals[maxIndex]!) },
    { headline: `${low}: ${chart.points[minIndex]!.label}`, detail: money(totals[minIndex]!) },
    { headline: 'Monthly average', detail: money(avg) },
  ];
  if (chart.series.length > 2) {
    const top = seriesTotals(chart)[0]!;
    insights.unshift({ headline: `${splitPath(top.label)[1]} leads`, detail: money(top.value) });
  }
  return insights;
}

function momentumOf(trend: number[]): number | null {
  if (trend.length < 3) return null;
  const last = trend[trend.length - 1]!;
  const rest = trend.slice(0, -1);
  const avg = rest.reduce((sum, value) => sum + value, 0) / rest.length;
  return avg === 0 ? null : (last - avg) / Math.abs(avg);
}

/**
 * The headline numbers: net worth (Account balances), then income and expense split out of an
 * income-vs-expense Widget, then any other Widget totals not already covered.
 */
export function heroKpisOf(widgets: ProtoWidget[]): Kpi[] {
  const kpis: Kpi[] = [];
  const used = new Set<string>();
  const balances = widgets.find((widget) => widget.source === 'account_balances');
  if (balances?.data && isNumber(balances.data.total)) {
    kpis.push({
      id: `${balances.id}-nw`,
      label: 'Net worth',
      value: balances.data.total,
      trend: [],
      momentum: null,
      href: balances.data.hrefs.total,
    });
    used.add(balances.id);
  }
  const flow = widgets.find((widget) => savingsRateOf(widget) !== null);
  if (flow?.data) {
    const data = flow.data;
    data.columns.forEach((column, c) => {
      const trend = data.cells.map((row) => row[c] ?? 0);
      kpis.push({
        id: `${flow.id}-${c}`,
        label: column.label,
        value: data.columnTotals[c] ?? 0,
        trend,
        momentum: momentumOf(trend.map(Math.abs)),
        href: data.hrefs.columnTotals[c] ?? data.hrefs.total,
      });
    });
    used.add(flow.id);
  }
  for (const widget of widgets) {
    if (used.has(widget.id)) continue;
    const kpi = kpiOf(widget);
    if (kpi) kpis.push(kpi);
  }
  return kpis;
}

/** Income and expense, when a widget has exactly one positive and one negative series. */
export function savingsRateOf(widget: ProtoWidget): number | null {
  const data = widget.data;
  if (!data || data.columns.length !== 2) return null;
  const [a, b] = data.columnTotals;
  if (!isNumber(a) || !isNumber(b)) return null;
  const income = Math.max(a, b);
  const expense = Math.min(a, b);
  if (income <= 0 || expense >= 0) return null;
  return (income + expense) / income;
}

export interface MonthlyFlow {
  months: string[];
  /** Money in per month (positive). */
  income: number[];
  /** Money out per month (positive magnitudes), per spending series, largest first. */
  spending: { label: string; values: number[]; total: number }[];
}

/**
 * The year as one picture: income from an income-vs-expense Widget, spending split by the
 * Widget with the most series (Categories). Months align by label. Null without both.
 */
export function monthlyFlowOf(widgets: ProtoWidget[]): MonthlyFlow | null {
  const flow = widgets.find((widget) => savingsRateOf(widget) !== null);
  const split = widgets
    .filter((widget) => widget.source === 'query')
    .map((widget) => ({ widget, chart: seriesOf(widget) }))
    .filter((item) => item.chart && item.chart.series.length > 2)
    .sort((a, b) => b.chart!.series.length - a.chart!.series.length)[0];
  const flowChart = flow ? seriesOf(flow) : null;
  if (!flowChart || !split?.chart) return null;
  const incomeKey = flowChart.series.find((series) =>
    flowChart.points.some((point) => (point.values[series.key] ?? 0) > 0),
  )?.key;
  const months = flowChart.points.map((point) => point.label);
  const income = flowChart.points.map((point) => Math.max(0, point.values[incomeKey ?? ''] ?? 0));
  const byLabel = new Map(split.chart.points.map((point) => [point.label, point]));
  const spending = split.chart.series
    .map((series) => {
      const values = months.map((month) => Math.abs(byLabel.get(month)?.values[series.key] ?? 0));
      return { label: series.label, values, total: values.reduce((sum, value) => sum + value, 0) };
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  return { months, income, spending };
}
