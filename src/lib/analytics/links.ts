import { drillUrl, type DrillTarget } from '@/lib/reporting/drill-link';
import type { DrillOrigin } from '@/lib/reporting/drill-origin';
import type { CellRef } from '@/server/services/reporting/cell-ref';
import type { WidgetQuery } from '@/server/services/reporting/query';
import type { PeriodView } from './period-view';

/** Where a Drill-down opened from Analytics leads back to: Analytics at the same Period view. */
export function analyticsOrigin(view: PeriodView): DrillOrigin {
  return { kind: 'analytics', period: view };
}

/** A query's Drill-downs, opened from Analytics at a Period view. */
export function analyticsDrill(view: PeriodView, query: WidgetQuery): DrillTarget {
  return { query, origin: analyticsOrigin(view) };
}

/** One figure's Drill-down on Analytics, linking back to Analytics at the same Period view. */
export function analyticsDrillUrl(view: PeriodView, query: WidgetQuery, cell: CellRef): string {
  return drillUrl(analyticsDrill(view, query), cell);
}
