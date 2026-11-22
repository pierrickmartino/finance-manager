import { drillUrl, type DrillTarget } from '@/lib/reporting/drill-link';
import type { DrillOrigin } from '@/lib/reporting/drill-origin';
import type { AnalyticsReading } from '@/server/services/analytics/reading';
import type { CellRef } from '@/server/services/reporting/cell-ref';
import type { WidgetQuery } from '@/server/services/reporting/query';

/** Where a Drill-down opened from Analytics leads back to: Analytics, read the same way. */
export function analyticsOrigin(reading: AnalyticsReading): DrillOrigin {
  return { kind: 'analytics', period: reading.view };
}

/** A query's Drill-downs, opened from Analytics. */
export function analyticsDrill(reading: AnalyticsReading, query: WidgetQuery): DrillTarget {
  return { query, origin: analyticsOrigin(reading) };
}

/** One figure's Drill-down on Analytics, linking back to Analytics read the same way. */
export function analyticsDrillUrl(
  reading: AnalyticsReading,
  query: WidgetQuery,
  cell: CellRef,
): string {
  return drillUrl(analyticsDrill(reading, query), cell);
}
