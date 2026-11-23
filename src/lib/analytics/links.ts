import type { Period } from '@/lib/analytics/period';
import { drillUrl, type DrillTarget } from '@/lib/reporting/drill-link';
import type { DrillOrigin } from '@/lib/reporting/drill-origin';
import type { CellRef } from '@/server/services/reporting/cell-ref';
import type { WidgetQuery } from '@/server/services/reporting/query';

/** What Analytics is read over, as far as its links need: the Period its URL carries. */
export interface PeriodRead {
  period: Period;
}

/** Where a Drill-down opened from Analytics leads back to: Analytics, read the same way. */
export function analyticsOrigin({ period }: PeriodRead): DrillOrigin {
  return { kind: 'analytics', period };
}

/** A query's Drill-downs, opened from Analytics. */
export function analyticsDrill(read: PeriodRead, query: WidgetQuery): DrillTarget {
  return { query, origin: analyticsOrigin(read) };
}

/** One figure's Drill-down on Analytics, linking back to Analytics read the same way. */
export function analyticsDrillUrl(read: PeriodRead, query: WidgetQuery, cell: CellRef): string {
  return drillUrl(analyticsDrill(read, query), cell);
}
