import type { AnalyticsPage } from '@/lib/analytics/period';
import { drillUrl, type DrillTarget } from '@/lib/reporting/drill-link';
import { analyticsDrillOrigin, type DrillOrigin } from '@/lib/reporting/drill-origin';
import type { CellRef } from '@/server/services/reporting/cell-ref';
import type { WidgetQuery } from '@/server/services/reporting/query';

/** What Analytics is read on, as far as its links need: the page its URL carries. */
export interface PageRead {
  page: AnalyticsPage;
}

/**
 * Where a Drill-down opened from Analytics leads back to: Analytics, read the same way, with the
 * page's Period and every Card's pin.
 */
export function analyticsOrigin({ page }: PageRead): DrillOrigin {
  return analyticsDrillOrigin(page.period, page.cardPeriods);
}

/** A query's Drill-downs, opened from Analytics. */
export function analyticsDrill(read: PageRead, query: WidgetQuery): DrillTarget {
  return { query, origin: analyticsOrigin(read) };
}

/** One figure's Drill-down on Analytics, linking back to Analytics read the same way. */
export function analyticsDrillUrl(read: PageRead, query: WidgetQuery, cell: CellRef): string {
  return drillUrl(analyticsDrill(read, query), cell);
}
