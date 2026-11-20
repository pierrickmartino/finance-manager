import { drillUrl } from '@/lib/reporting/drill-link';
import type { PeriodView } from '@/lib/analytics/period-view';
import type { DrillRef } from '@/server/services/analytics';

/** A figure's Drill-down on Analytics, linking back to Analytics at the same Period view. */
export function drillHref(view: PeriodView, drill: DrillRef): string {
  return drillUrl({ query: drill.query, origin: { kind: 'analytics', period: view } }, drill.cell);
}
