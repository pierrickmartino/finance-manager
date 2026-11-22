import type { Span } from '@/lib/analytics/span';
import { drillUrl, type DrillTarget } from '@/lib/reporting/drill-link';
import type { DrillOrigin } from '@/lib/reporting/drill-origin';
import type { CellRef } from '@/server/services/reporting/cell-ref';
import type { WidgetQuery } from '@/server/services/reporting/query';

/** What Analytics is read over, as far as its links need: the Span its URL carries. */
export interface SpanRead {
  span: Span;
}

/** Where a Drill-down opened from Analytics leads back to: Analytics, read the same way. */
export function analyticsOrigin({ span }: SpanRead): DrillOrigin {
  return { kind: 'analytics', span };
}

/** A query's Drill-downs, opened from Analytics. */
export function analyticsDrill(read: SpanRead, query: WidgetQuery): DrillTarget {
  return { query, origin: analyticsOrigin(read) };
}

/** One figure's Drill-down on Analytics, linking back to Analytics read the same way. */
export function analyticsDrillUrl(read: SpanRead, query: WidgetQuery, cell: CellRef): string {
  return drillUrl(analyticsDrill(read, query), cell);
}
