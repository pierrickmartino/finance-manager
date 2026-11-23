import type { AnalyticsPage } from '@/lib/analytics/period';
import { drillUrl, type DrillTarget } from '@/lib/reporting/drill-link';
import { analyticsDrillOrigin } from '@/lib/reporting/drill-origin';
import type { CellRef } from '@/server/services/reporting/cell-ref';
import type { WidgetQuery } from '@/server/services/reporting/query';

/**
 * A query's Drill-downs, opened from Analytics: leading back to the page it was opened on, with
 * its Period and every Card's pin.
 */
export function analyticsDrill(page: AnalyticsPage, query: WidgetQuery): DrillTarget {
  return { query, origin: analyticsDrillOrigin(page) };
}

/** One figure's Drill-down on Analytics, linking back to the page it was opened on. */
export function analyticsDrillUrl(page: AnalyticsPage, query: WidgetQuery, cell: CellRef): string {
  return drillUrl(analyticsDrill(page, query), cell);
}
