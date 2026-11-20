import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { PeriodView } from '@/lib/analytics/period-view';
import type { SpendingByCategory, SpendingSeries } from '@/server/services/analytics';
import { CHART_PALETTE } from '../dashboards/chart-palette';
import { drillHref } from './links';
import { SectionCard } from './section';
import { SpendingChart, type SpendingChartSeries } from './spending-chart';

export const SPENDING_BY_CATEGORY = 'Spending by Category';

/** Named Categories take the categorical hues in order; "Other" takes the muted grey. */
function colorOf(series: SpendingSeries, index: number): string {
  return series.isOther ? CHART_PALETTE.other : CHART_PALETTE.series[index]!;
}

interface LegendProps {
  series: SpendingSeries[];
  view: PeriodView;
  fmt: Formatter;
}

/** Each series with its total over the window, opening that total's Drill-down. */
function Legend({ series, view, fmt }: LegendProps) {
  return (
    <ul
      aria-label={`${SPENDING_BY_CATEGORY} legend`}
      className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3"
    >
      {series.map((entry, index) => {
        const amount =
          entry.total.value === null ? '—' : fmt.amount(entry.total.value, { currency: 'CHF' });
        return (
          <li key={entry.key} className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2">
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
              <rect width={10} height={10} rx={2} fill={colorOf(entry, index)} />
            </svg>
            <span className="truncate">{entry.label}</span>
            <Link
              href={drillHref(view, entry.total.drill)}
              aria-label={`${entry.label}, Total: ${amount}`}
              className="text-muted tabular-nums hover:underline"
            >
              {amount}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface SpendingByCategorySectionProps {
  chart: Promise<SpendingByCategory>;
  view: PeriodView;
  fmt: Formatter;
}

/** Analytics' Spending by Category stacked bar, once its figures arrive. */
export async function SpendingByCategorySection({
  chart,
  view,
  fmt,
}: SpendingByCategorySectionProps) {
  const loaded = await chart;
  // Client charts take links, not Drill-down references.
  const series: SpendingChartSeries[] = loaded.series.map((entry, index) => ({
    key: entry.key,
    label: entry.label,
    color: colorOf(entry, index),
    cells: entry.cells.map((cell) => ({ value: cell.value, href: drillHref(view, cell.drill) })),
  }));
  return (
    <SectionCard name={SPENDING_BY_CATEGORY}>
      {loaded.isEmpty ? (
        <p className="py-8 text-sm text-muted">
          Nothing to show yet: no spending in these periods.
        </p>
      ) : (
        <>
          <SpendingChart name={SPENDING_BY_CATEGORY} periods={loaded.periods} series={series} />
          <Legend series={loaded.series} view={view} fmt={fmt} />
        </>
      )}
    </SectionCard>
  );
}
